/**
 * Site Router
 * 
 * tRPC procedures for site/store operations.
 * Maps to the Site model in the database.
 */

import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { logger } from '@/lib/logger'
import { withRetry, isConnectionError } from '../utils/withRetry'
import { SITE_ROLE_TYPES } from '@/lib/constants/roleTypes'

/**
 * Get or create a role-based group for a given role
 */
async function ensureRoleGroup(siteId: string, role: string): Promise<string | null> {
    if (!role || role.trim() === '') return null

    const existingGroup = await prisma.group.findFirst({
        where: {
            siteId,
            name: role
        }
    })

    if (existingGroup) {
        return existingGroup.id
    }

    const isStandardRole = SITE_ROLE_TYPES.some(r => r.value === role)
    
    const roleGroup = await prisma.group.create({
        data: {
            id: randomUUID(),
            name: role,
            description: `Auto-generated group for ${role} role`,
            color: isStandardRole ? '#4c7dff' : '#8b5cf6',
            siteId,
            updatedAt: new Date()
        }
    })

    logger.info(`Created role group "${role}" for site ${siteId}`)
    return roleGroup.id
}

/**
 * Sync a person to their role group
 */
async function syncPersonToRoleGroup(personId: string, siteId: string, newRole: string | null | undefined, oldRole?: string | null) {
    try {
        if (oldRole && oldRole !== newRole) {
            const oldRoleGroup = await prisma.group.findFirst({
                where: { siteId, name: oldRole }
            })
            if (oldRoleGroup) {
                await prisma.groupPerson.deleteMany({
                    where: {
                        groupId: oldRoleGroup.id,
                        personId
                    }
                })
            }
        }

        if (newRole && newRole.trim() !== '') {
            const roleGroupId = await ensureRoleGroup(siteId, newRole)
            if (roleGroupId) {
                const existing = await prisma.groupPerson.findFirst({
                    where: {
                        groupId: roleGroupId,
                        personId
                    }
                })
                if (!existing) {
                    await prisma.groupPerson.create({
                        data: {
                            id: randomUUID(),
                            groupId: roleGroupId,
                            personId
                        }
                    })
                }
            }
        }
    } catch (error) {
        logger.error(`Error syncing person ${personId} to role group:`, error)
    }
}

/**
 * Parse manager name into firstName and lastName
 * Handles various formats: "John Doe", "John", "Doe, John", etc.
 */
function parseManagerName(managerName: string): { firstName: string; lastName: string } {
  const trimmed = managerName.trim()
  
  if (!trimmed) {
    return {
      firstName: 'Manager',
      lastName: 'Manager'
    }
  }
  
  // Handle "Last, First" format
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim()).filter(p => p.length > 0)
    if (parts.length >= 2) {
      return {
        firstName: parts[1],
        lastName: parts[0]
      }
    }
    // If comma but only one part, treat as single name
    if (parts.length === 1) {
      return {
        firstName: parts[0],
        lastName: 'Manager'
      }
    }
  }
  
  // Handle "First Last" format - split on whitespace
  const parts = trimmed.split(/\s+/).filter(p => p.length > 0)
  if (parts.length >= 2) {
    // First word is firstName, rest is lastName
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ')
    }
  }
  
  // Single word - use as firstName, set lastName to "Manager"
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: 'Manager'
    }
  }
  
  // Fallback (shouldn't happen)
  return {
    firstName: trimmed,
    lastName: 'Manager'
  }
}

/**
 * Create or update person from site manager
 * @param siteId - The site ID
 * @param managerName - The person's name
 * @param role - The role type (defaults to 'Manager' for backward compatibility)
 */
async function syncManagerToPerson(siteId: string, managerName: string | null | undefined, role: string = 'Manager') {
  if (!managerName || !managerName.trim()) {
    return null
  }

  const { firstName, lastName } = parseManagerName(managerName)
  const finalRole = role || 'Manager'
  
  // Check if person already exists for this site with matching name
  const existingPerson = await prisma.person.findFirst({
    where: {
      siteId,
      firstName,
      lastName,
    },
  })

  if (existingPerson) {
    // Update existing person if needed
    const oldRole = existingPerson.role
    const person = await prisma.person.update({
      where: { id: existingPerson.id },
      data: {
        firstName,
        lastName,
        role: finalRole,
        updatedAt: new Date(),
      },
    })

    // Sync to role group if role changed
    if (finalRole !== oldRole) {
      await syncPersonToRoleGroup(person.id, siteId, finalRole, oldRole)
    }

    return person
  }

  // Create new person
  const person = await prisma.person.create({
    data: {
      id: randomUUID(),
      siteId,
      firstName,
      lastName,
      role: finalRole,
      updatedAt: new Date(),
    },
  })

  // Sync to role group
  if (finalRole) {
    await syncPersonToRoleGroup(person.id, siteId, finalRole)
  }

  return person
}

export const siteRouter = router({
  list: publicProcedure.query(async () => {
    try {
      const sites = await prisma.site.findMany({
        orderBy: {
          createdAt: 'asc',
        },
      })
      return sites
    } catch (error: any) {
      console.error('Error in site.list:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
        stack: error.stack,
      })

      // Handle missing column error (P2022) - use raw SQL to select without imageUrl
      if (error.code === 'P2022' && error.meta?.column === 'Site.imageUrl') {
        logger.debug('imageUrl column missing, using raw SQL query without imageUrl...')
        try {
          const sites = await prisma.$queryRaw<Array<{
            id: string
            name: string
            storeNumber: string | null
            address: string | null
            city: string | null
            state: string | null
            zipCode: string | null
            phone: string | null
            manager: string | null
            squareFootage: number | null
            openedDate: Date | null
            createdAt: Date
            updatedAt: Date
          }>>`
            SELECT id, name, "storeNumber", address, city, state, "zipCode", phone, manager, "squareFootage", "openedDate", "createdAt", "updatedAt"
            FROM "Site"
            ORDER BY "createdAt" ASC
          `
          // Add imageUrl as null for all sites
          return sites.map(site => ({ ...site, imageUrl: null }))
        } catch (rawError: any) {
          console.error('Raw SQL query also failed:', rawError)
          return []
        }
      }

      // Handle authentication errors specifically
      if (error.message?.includes('Authentication failed') ||
        error.message?.includes('credentials') ||
        error.code === 'P1000' || error.code === 'P1001') {
        console.error('❌ Database authentication failed. Check DATABASE_URL environment variable.')
        throw new Error('Database connection failed. Please check your database credentials.')
      }

      // Return empty array on other errors to prevent UI crashes
      return []
    }
  }),

  listWithSummaries: publicProcedure.query(async () => {
    try {
      const sites = await prisma.site.findMany({
        orderBy: { createdAt: 'asc' },
      })

      const [devices, zoneCounts, faultCounts, mapLocations] = await Promise.all([
        prisma.device.findMany({
          where: { parentId: null },
          select: { siteId: true, status: true, warrantyExpiry: true },
        }),
        prisma.zone.groupBy({
          by: ['siteId'],
          _count: { id: true },
        }),
        prisma.fault.findMany({
          where: { resolved: false },
          select: { deviceId: true },
        }),
        prisma.location.findMany({
          where: { type: 'base', imageUrl: { not: null } },
          select: { siteId: true },
        }),
      ])

      const deviceSiteIds = await prisma.device.findMany({
        where: { id: { in: faultCounts.map(f => f.deviceId) } },
        select: { id: true, siteId: true },
      })
      const faultBySite = deviceSiteIds.reduce<Record<string, number>>((acc, d) => {
        acc[d.siteId] = (acc[d.siteId] || 0) + 1
        return acc
      }, {})

      const zoneBySite = Object.fromEntries(zoneCounts.map(z => [z.siteId, z._count.id]))
      const mapSiteIds = new Set(mapLocations.map(l => l.siteId))

      const now = new Date()
      const nearEndDays = 30

      const deviceBySite = devices.reduce<Record<string, typeof devices>>((acc, d) => {
        if (!acc[d.siteId]) acc[d.siteId] = []
        acc[d.siteId].push(d)
        return acc
      }, {})

      return sites.map((site) => {
        const siteDevices = deviceBySite[site.id] || []
        const totalDevices = siteDevices.length
        const onlineDevices = siteDevices.filter(d => d.status === 'ONLINE').length
        const healthPercentage = totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 100
        const totalZones = zoneBySite[site.id] || 0
        const criticalFaults = faultBySite[site.id] || 0

        let warrantiesExpiring = 0
        let warrantiesExpired = 0
        for (const d of siteDevices) {
          if (!d.warrantyExpiry) continue
          const expiry = new Date(d.warrantyExpiry)
          const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          if (daysRemaining < 0) warrantiesExpired++
          else if (daysRemaining <= nearEndDays) warrantiesExpiring++
        }

        return {
          ...site,
          totalDevices,
          onlineDevices,
          offlineDevices: totalDevices - onlineDevices,
          healthPercentage,
          totalZones,
          criticalFaults,
          warrantiesExpiring,
          warrantiesExpired,
          mapUploaded: mapSiteIds.has(site.id),
        }
      })
    } catch (error: any) {
      logger.error('site.listWithSummaries failed:', error)
      return []
    }
  }),

  getById: publicProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ input }) => {
      const site = await prisma.site.findUnique({
        where: { id: input.id },
      })
      return site
    }),

  getByStoreNumber: publicProcedure
    .input(z.object({
      storeNumber: z.string(),
    }))
    .query(async ({ input }) => {
      const site = await prisma.site.findFirst({
        where: { storeNumber: input.storeNumber },
      })
      return site
    }),

  create: publicProcedure
    .input(z.object({
      name: z.string(),
      storeNumber: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      phone: z.string().optional(),
      manager: z.string().optional(),
      personRole: z.string().optional(), // Role type for the person
      squareFootage: z.number().optional(),
      openedDate: z.date().optional(),
      imageUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const site = await prisma.site.create({
        data: {
          id: randomUUID(),
          name: input.name,
          storeNumber: input.storeNumber,
          address: input.address,
          city: input.city,
          state: input.state,
          zipCode: input.zipCode,
          phone: input.phone,
          manager: input.manager,
          squareFootage: input.squareFootage,
          openedDate: input.openedDate,
          imageUrl: input.imageUrl,
          updatedAt: new Date(),
        },
      })

      // Create person from manager if provided
      if (input.manager) {
        try {
          await syncManagerToPerson(site.id, input.manager, input.personRole)
        } catch (error) {
          // Log error but don't fail site creation
          logger.error('Failed to create person from manager', { error, siteId: site.id, manager: input.manager, role: input.personRole })
        }
      }

      return site
    }),

  update: publicProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      storeNumber: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      phone: z.string().optional(),
      manager: z.string().optional(),
      personRole: z.string().optional(), // Role type for the person
      squareFootage: z.number().optional(),
      openedDate: z.date().optional(),
      imageUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, personRole, ...updates } = input

      if (updates.imageUrl) {
        logger.debug('Updating site imageUrl length:', updates.imageUrl.length)
      }

      // Get existing site to check if manager changed or if we need to update role
      let existingSite = null
      if (updates.manager !== undefined || personRole !== undefined) {
        try {
          existingSite = await prisma.site.findUnique({
            where: { id },
            select: { manager: true },
          })
        } catch (error) {
          // Ignore errors, will handle in main update
        }
      }

      try {
        const site = await withRetry(
          () => prisma.site.update({ where: { id }, data: updates }),
          { context: 'site.update' }
        )

        // Get the manager name to use (either from updates or existing site)
        const managerName = updates.manager !== undefined ? updates.manager : existingSite?.manager

        // Create/update person from manager if:
        // 1. Manager was provided and changed, OR
        // 2. Role was provided and manager exists (to update role)
        if (managerName) {
          const managerChanged = updates.manager !== undefined && (!existingSite || existingSite.manager !== updates.manager)
          const roleChanged = personRole !== undefined
          
          if (managerChanged || roleChanged) {
            try {
              await syncManagerToPerson(id, managerName, personRole || 'Manager')
            } catch (error) {
              // Log error but don't fail site update
              logger.error('Failed to sync manager to person', { error, siteId: id, manager: managerName, role: personRole })
            }
          }
        }

        return site
      } catch (error: any) {
        // Handle "record not found" errors
        if (error.code === 'P2025' || error.message?.includes('not found')) {
          throw new Error(`Site with ID ${input.id} not found in database`)
        }
        // Handle column doesn't exist errors
        if (error.code === '42703' || error.message?.includes('does not exist')) {
          throw new Error('Database schema is out of date. Please run database migration.')
        }
        throw new Error(`Failed to update site: ${error.message || 'Unknown error'}`)
      }
    }),

  // Ensure site exists - creates if it doesn't, returns if it does
  ensureExists: publicProcedure
    .input(z.object({
      id: z.string(),
      name: z.string(),
      storeNumber: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      phone: z.string().optional(),
      manager: z.string().optional(),
      squareFootage: z.number().optional(),
      openedDate: z.date().optional(),
      imageUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const MAX_RETRIES = 3
      let retries = 0

      while (retries < MAX_RETRIES) {
        try {
          // Try to find existing site - handle missing imageUrl column gracefully
          let existing
          try {
            existing = await prisma.site.findUnique({
              where: { id: input.id },
            })
          } catch (findError: any) {
            // If imageUrl column is missing, use raw SQL
            if (findError.code === 'P2022' && findError.meta?.column === 'Site.imageUrl') {
              const rawSite = await prisma.$queryRaw<Array<{
                id: string
                name: string
                storeNumber: string | null
                address: string | null
                city: string | null
                state: string | null
                zipCode: string | null
                phone: string | null
                manager: string | null
                squareFootage: number | null
                openedDate: Date | null
                createdAt: Date
                updatedAt: Date
              }>>`
                SELECT id, name, "storeNumber", address, city, state, "zipCode", phone, manager, "squareFootage", "openedDate", "createdAt", "updatedAt"
                FROM "Site"
                WHERE id = ${input.id}
              `
              existing = rawSite[0] ? { ...rawSite[0], imageUrl: null } : null
            } else {
              throw findError
            }
          }

          if (existing) {
            return existing
          }

          // Try to find by store number if provided
          if (input.storeNumber) {
            let byStoreNumber
            try {
              byStoreNumber = await prisma.site.findFirst({
                where: { storeNumber: input.storeNumber },
              })
            } catch (findError: any) {
              // If imageUrl column is missing, use raw SQL
              if (findError.code === 'P2022' && findError.meta?.column === 'Site.imageUrl') {
                const rawSite = await prisma.$queryRaw<Array<{
                  id: string
                  name: string
                  storeNumber: string | null
                  address: string | null
                  city: string | null
                  state: string | null
                  zipCode: string | null
                  phone: string | null
                  manager: string | null
                  squareFootage: number | null
                  openedDate: Date | null
                  createdAt: Date
                  updatedAt: Date
                }>>`
                  SELECT id, name, "storeNumber", address, city, state, "zipCode", phone, manager, "squareFootage", "openedDate", "createdAt", "updatedAt"
                  FROM "Site"
                  WHERE "storeNumber" = ${input.storeNumber}
                  LIMIT 1
                `
                byStoreNumber = rawSite[0] ? { ...rawSite[0], imageUrl: null } : null
              } else {
                throw findError
              }
            }
            if (byStoreNumber) {
              return byStoreNumber
            }
          }

          // Create new site - filter out undefined values and imageUrl if column doesn't exist
          const siteData: any = {
            id: input.id,
            name: input.name,
          }

          if (input.storeNumber !== undefined) siteData.storeNumber = input.storeNumber
          if (input.address !== undefined) siteData.address = input.address
          if (input.city !== undefined) siteData.city = input.city
          if (input.state !== undefined) siteData.state = input.state
          if (input.zipCode !== undefined) siteData.zipCode = input.zipCode
          if (input.phone !== undefined) siteData.phone = input.phone
          if (input.manager !== undefined) siteData.manager = input.manager
          if (input.squareFootage !== undefined) siteData.squareFootage = input.squareFootage
          if (input.openedDate !== undefined) siteData.openedDate = input.openedDate
          // Only include imageUrl if we know the column exists (will be handled in catch if it doesn't)

          let site
          try {
            if (input.imageUrl !== undefined) siteData.imageUrl = input.imageUrl
            site = await prisma.site.create({
              data: siteData,
            })
          } catch (createError: any) {
            // If imageUrl column is missing, create without it
            if (createError.code === 'P2022' && createError.meta?.column === 'Site.imageUrl') {
              delete siteData.imageUrl
              site = await prisma.site.create({
                data: siteData,
              })
              // Add imageUrl as null to match schema
              site = { ...site, imageUrl: null }
            } else {
              throw createError
            }
          }

          // Create person from manager if provided (default to Manager role for ensureExists)
          if (input.manager) {
            try {
              await syncManagerToPerson(site.id, input.manager, 'Manager')
            } catch (error) {
              // Log error but don't fail site creation
              logger.error('Failed to create person from manager in ensureExists', { error, siteId: site.id, manager: input.manager })
            }
          }

          return site
        } catch (error: any) {
          // Log error for debugging with full details
          console.error('Error in ensureExists:', {
            message: error.message,
            code: error.code,
            meta: error.meta,
            stack: error.stack,
            input: input,
            retry: retries,
          })

          // Handle prepared statement errors with retry
          if (error.code === '26000' || error.code === '42P05' || error.message?.includes('prepared statement')) {
            retries++
            if (retries < MAX_RETRIES) {
              logger.debug(`Retrying site.ensureExists after prepared statement error. Attempt ${retries}/${MAX_RETRIES}...`)
              await new Promise(resolve => setTimeout(resolve, 200 * retries)) // Exponential backoff
              continue // Retry the loop
            }
          }

          // If it's a unique constraint violation, try to find the existing site
          if (error.code === 'P2002') {
            try {
              // Unique constraint violation - site might exist with different ID
              // Try to find by store number or name
              const orConditions: Array<{ storeNumber?: string } | { name: string }> = [
                { name: input.name },
              ]
              if (input.storeNumber) {
                orConditions.push({ storeNumber: input.storeNumber })
              }

              const found = await prisma.site.findFirst({
                where: {
                  OR: orConditions,
                },
              })
              if (found) {
                return found
              }
            } catch (findError) {
              console.error('Error finding existing site during P2002 handling:', findError)
            }
          }

          // Check for database connection errors
          if (error.message?.includes('Can\'t reach database') ||
            error.message?.includes('P1001') ||
            error.message?.includes('Authentication failed') ||
            error.code === 'P1001' ||
            error.code === 'P1000') {
            throw new Error('Database connection failed. Please check your DATABASE_URL environment variable.')
          }

          // If we've exhausted retries, throw the error
          if (retries >= MAX_RETRIES) {
            throw new Error(`Failed to ensure site exists after ${MAX_RETRIES} retries: ${error.message || 'Unknown error'}`)
          }

          // For other errors, throw immediately
          throw new Error(`Failed to ensure site exists: ${error.message || 'Unknown error'}`)
        }
      }

      throw new Error(`Failed to ensure site exists after ${MAX_RETRIES} retries.`)
    }),

  // Delete site and all related data (cascade delete)
  delete: publicProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        // First check if site exists
        const site = await prisma.site.findUnique({
          where: { id: input.id },
          select: { id: true },
        })

        if (!site) {
          throw new Error(`Site with ID ${input.id} not found in database`)
        }

        // Delete related data first (cascade order matters)
        // Note: Prisma should handle cascades if foreign keys are set up correctly,
        // but we'll do explicit deletes to be safe

        // First, get all zones for this site to delete related rules and mappings
        const zones = await prisma.zone.findMany({
          where: { siteId: input.id },
          select: { id: true },
        })
        const zoneIds = zones.map(z => z.id)

        // Delete rules associated with zones in this site
        if (zoneIds.length > 0) {
          await prisma.rule.deleteMany({
            where: { zoneId: { in: zoneIds } },
          })
        }

        // Delete BACnet mappings (cascade will handle this, but explicit for clarity)
        if (zoneIds.length > 0) {
          await prisma.bACnetMapping.deleteMany({
            where: { zoneId: { in: zoneIds } },
          })
        }

        // Delete zone devices (junction table) - cascade will handle this via zones
        // but explicit delete for clarity
        if (zoneIds.length > 0) {
          await prisma.zoneDevice.deleteMany({
            where: {
              zoneId: { in: zoneIds },
            },
          })
        }

        // Delete devices (and their components via cascade)
        await prisma.device.deleteMany({
          where: { siteId: input.id },
        })

        // Delete zones (this will cascade delete BACnetMappings and ZoneDevices)
        await prisma.zone.deleteMany({
          where: { siteId: input.id },
        })

        // Finally delete the site
        await prisma.site.delete({
          where: { id: input.id },
        })

        return { success: true, deletedId: input.id }
      } catch (error: any) {
        console.error('Error in site.delete:', {
          message: error.message,
          code: error.code,
          meta: error.meta,
          stack: error.stack,
          input: input,
        })

        // Handle "record not found" errors
        if (error.code === 'P2025' || error.message?.includes('Record to delete does not exist') || error.message?.includes('not found')) {
          throw new Error(`Site with ID ${input.id} not found in database`)
        }

        // Handle foreign key constraint violations
        if (error.code === 'P2003' || error.message?.includes('Foreign key constraint')) {
          throw new Error(`Cannot delete site: Related data still exists. Please delete related devices, zones, and rules first.`)
        }

        // Handle database connection errors
        if (error.message?.includes('Can\'t reach database') ||
          error.message?.includes('P1001') ||
          error.message?.includes('Authentication failed') ||
          error.code === 'P1001' ||
          error.code === 'P1000') {
          throw new Error('Database connection failed. Please check your DATABASE_URL environment variable.')
        }

        // Re-throw with more context
        throw new Error(`Failed to delete site: ${error.message || 'Unknown error'}`)
      }
    }),

  // Sync all site managers to people
  syncManagersToPeople: publicProcedure
    .mutation(async () => {
      try {
        const sites = await prisma.site.findMany({
          where: {
            manager: { not: null },
          },
          select: {
            id: true,
            manager: true,
          },
        })

        const results = []
        for (const site of sites) {
          if (site.manager) {
            try {
              const person = await syncManagerToPerson(site.id, site.manager, 'Manager')
              if (person) {
                results.push({ siteId: site.id, personId: person.id, success: true })
              }
            } catch (error) {
              logger.error('Failed to sync manager to person', { siteId: site.id, manager: site.manager, error })
              results.push({ siteId: site.id, success: false, error: String(error) })
            }
          }
        }

        return {
          synced: results.filter(r => r.success).length,
          total: sites.length,
          results,
        }
      } catch (error: any) {
        logger.error('Failed to sync managers to people', { error })
        throw new Error(`Failed to sync managers: ${error.message || 'Unknown error'}`)
      }
    }),

  // Note: Seeding endpoint removed because Next.js cannot resolve TypeScript files
  // in the scripts/ directory at runtime. Use the npm script instead:
  // npm run db:seed
})

