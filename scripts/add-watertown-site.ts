/**
 * Add Watertown site to existing database
 *
 * Creates the Watertown location with zones, devices, rules, and BACnet mappings.
 * Uses the same manager/CEO as the first existing site.
 *
 * Usage: npm run db:add-watertown
 *    or: npx tsx scripts/add-watertown-site.ts
 */

import { addWatertownSite } from './seedDatabase'

addWatertownSite().catch((e) => {
  console.error(e)
  process.exit(1)
})
