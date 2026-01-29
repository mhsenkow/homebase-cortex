/**
 * Dashboard / Home Page
 * 
 * Multi-site overview showing all sites in a grid.
 * Each card provides a summary with key metrics, faults, warranties, and map status.
 * Clicking a card switches to that site and navigates to relevant pages.
 * 
 * AI Note: This dashboard provides a high-level view across all stores,
 * allowing users to quickly identify issues and dive into specific stores.
 */

'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { skipToken } from '@tanstack/react-query'
import { SearchIsland } from '@/components/layout/SearchIsland'
import { ResizablePanel } from '@/components/layout/ResizablePanel'
import { SiteDetailsPanel } from '@/components/dashboard/StoreDetailsPanel'
// import { AddSiteModal } from '@/components/dashboard/AddSiteModal' // Removed
// import { SiteManagerDisplay } from '@/components/dashboard/SiteManagerDisplay' // Removed
import { useSite, Site } from '@/lib/SiteContext'
import { useDevices } from '@/lib/DomainContext'
import { useZones } from '@/lib/DomainContext'
import { useRules } from '@/lib/DomainContext'
import { trpc } from '@/lib/trpc/client'
import { useToast } from '@/lib/ToastContext'
import { Device } from '@/lib/mockData'
import { Zone } from '@/lib/DomainContext'
import { Rule } from '@/lib/mockRules'
import { FaultCategory, assignFaultCategory, generateFaultDescription } from '@/lib/faultDefinitions'
import { calculateWarrantyStatus } from '@/lib/warranty'
import {
  AlertTriangle,
  Shield,
  Map,
  MapPin,
  ChevronRight,
  Activity,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  Building2,
  Image as ImageIcon,
  Search,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PanelEmptyState } from '@/components/shared/PanelEmptyState'
import { MapUpload } from '@/components/map/MapUpload'
import dynamic from 'next/dynamic'

// Dynamically import MapCanvas to avoid SSR issues
const MapCanvas = dynamic(() => import('@/components/map/MapCanvas').then(mod => ({ default: mod.MapCanvas })), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <div className="text-[var(--color-text-muted)]">Loading map...</div>
    </div>
  ),
})

interface SiteSummary {
  siteId: string
  siteName: string
  totalDevices: number
  onlineDevices: number
  offlineDevices: number
  healthPercentage: number
  totalZones: number
  criticalFaults: Array<{
    deviceId: string
    deviceName: string
    faultType: FaultCategory
    description: string
    location: string
  }>
  warrantiesExpiring: number
  warrantiesExpired: number
  mapUploaded: boolean
  lastActivity?: string
  needsAttention: boolean
}

// Site Image Card Component (loads from database first, then client storage)
function SiteImageCard({ siteId, sizeClass = "w-24 h-24" }: { siteId: string, sizeClass?: string }) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [imageKey, setImageKey] = useState(0) // Force re-render on update

  // Validate siteId before querying - use skipToken to completely skip query if invalid
  const isValidSiteId = !!(siteId && typeof siteId === 'string' && siteId.length > 0)

  // Don't render if siteId is invalid
  if (!isValidSiteId) {
    return (
      <div className={`flex-shrink-0 ${sizeClass} rounded-lg bg-gradient-to-br from-[var(--color-primary-soft)]/20 to-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] flex items-center justify-center`}>
        <div className="text-[var(--color-text-subtle)] text-xs">No Image</div>
      </div>
    )
  }

  // Query site image from database using tRPC
  // Use skipToken to completely skip the query when siteId is invalid
  // Also use enabled to prevent query execution if siteId is invalid
  // Ensure input is always a proper object, never undefined
  const queryInput = isValidSiteId && siteId ? { siteId: String(siteId).trim() } : skipToken
  const { data: dbImage, isLoading: isDbLoading, isError: isDbError, refetch: refetchSiteImage } = trpc.image.getSiteImage.useQuery(
    queryInput,
    {
      // Double protection: enabled flag prevents query execution
      enabled: isValidSiteId && !!siteId && siteId.trim().length > 0,
      // Skip if siteId is invalid to avoid validation errors
      retry: false,
      // Refetch on mount to ensure fresh data
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      // Don't use stale data
      staleTime: 0,
    }
  )

  // Log query state only when debugging needed
  // ... (Removed excessive logging for cleaner code)

  useEffect(() => {
    const loadImage = async () => {
      try {
        if (isDbLoading) return
        if (isDbError) { } // Handle error silently

        // First try database
        if (dbImage) {
          setDisplayUrl(dbImage)
          return
        }

        // Fallback to client storage
        try {
          const { getSiteImage } = await import('@/lib/libraryUtils')
          const image = await getSiteImage(siteId)
          if (image) {
            setDisplayUrl(image)
          } else {
            setDisplayUrl(null)
          }
        } catch (e) {
          setDisplayUrl(null)
        }
      } catch (error) {
        setDisplayUrl(null)
      }
    }

    loadImage()

    // Listen for site image updates
    const handleSiteImageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ siteId: string }>
      if (!customEvent.detail || customEvent.detail?.siteId === siteId) {
        setImageKey(prev => prev + 1)
        if (siteId) {
          const isTempId = /^site-\d+$/.test(siteId) || siteId.startsWith('temp-')
          const isRealDbId = siteId.length > 15 && !isTempId
          if (!isTempId && isRealDbId) {
            refetchSiteImage()
          }
        }
        loadImage()
      }
    }
    window.addEventListener('siteImageUpdated', handleSiteImageUpdate)
    return () => window.removeEventListener('siteImageUpdated', handleSiteImageUpdate)
  }, [siteId, dbImage, isDbLoading, isDbError, refetchSiteImage])

  return (
    <div className={`flex-shrink-0 ${sizeClass} rounded-lg bg-gradient-to-br from-[var(--color-primary-soft)]/20 to-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] flex items-center justify-center relative overflow-hidden`}>
      {displayUrl ? (
        <img
          src={displayUrl}
          alt="Site"
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <>
          <Building2 size={32} className="text-[var(--color-primary)]/40" />
          <div className="absolute bottom-1 right-1">
            <div className="p-1 rounded bg-[var(--color-surface)]/80 backdrop-blur-sm border border-[var(--color-border-subtle)]">
              <ImageIcon size={10} className="text-[var(--color-text-muted)]" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { sites, activeSiteId, setActiveSite, activeSite, addSite, updateSite, removeSite } = useSite()
  const { devices } = useDevices()
  const { zones } = useZones()
  // const { rules } = useRules() // Unused
  const trpcUtils = trpc.useUtils()
  const { addToast } = useToast()

  // -- Map / Location State --
  const { data: locations = [] } = trpc.location.list.useQuery(
    { siteId: activeSiteId || '' },
    { enabled: !!activeSiteId }
  )

  // Use the first base location or the last active one
  const currentLocation = useMemo(() => {
    if (!locations.length) return null
    // Prefer base locations
    return locations.find((l: any) => l.type === 'base') || locations[0]
  }, [locations])

  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null)

  // Load map image
  useEffect(() => {
    if (!currentLocation) {
      setMapImageUrl(null)
      return
    }
    if (currentLocation.imageUrl) {
      setMapImageUrl(currentLocation.imageUrl)
    } else {
      setMapImageUrl(null)
    }
  }, [currentLocation])

  const mapUploaded = !!currentLocation

  // -- Site Data aggregation (kept for the summary/overlay) --
  const [siteSummaries, setSiteSummaries] = useState<SiteSummary[]>([])

  // Fetch key data for active site
  const [siteDevices, setSiteDevices] = useState<Device[]>([])
  const [siteZones, setSiteZones] = useState<Zone[]>([])
  const [siteFaults, setSiteFaults] = useState<any[]>([])

  useEffect(() => {
    if (!activeSiteId) return

    const fetchData = async () => {
      try {
        const [fetchedDevices, fetchedZones, fetchedFaults] = await Promise.all([
          trpcUtils.device.list.fetch({ siteId: activeSiteId, includeComponents: true }),
          trpcUtils.zone.list.fetch({ siteId: activeSiteId }),
          trpcUtils.fault.list.fetch({ siteId: activeSiteId, includeResolved: false })
        ])

        setSiteDevices(fetchedDevices || [])
        setSiteZones((fetchedZones || []).map((z: any) => ({ ...z, polygon: z.polygon || [] })))
        setSiteFaults(fetchedFaults || [])

      } catch (e) {
        console.error("Error fetching dashboard data", e)
      }
    }
    fetchData()
  }, [activeSiteId, trpcUtils])

  // Compute summary for the active site
  const activeSiteSummary = useMemo(() => {
    if (!activeSite) return null

    // Calculate stats
    const onlineDevices = siteDevices.filter(d => d.status === 'online').length
    const offlineDevices = siteDevices.filter(d => d.status === 'offline' || d.status === 'missing')
    const healthPercentage = siteDevices.length > 0
      ? Math.round((onlineDevices / siteDevices.length) * 100)
      : 100

    const criticalFaults = (siteFaults || []).slice(0, 3).map(fault => ({
      deviceId: fault.deviceId,
      deviceName: fault.deviceId, // simplistic
      faultType: fault.faultType as FaultCategory,
      description: fault.description,
      location: 'Unknown',
    }))

    // Warranties
    let warrantiesExpiring = 0
    let warrantiesExpired = 0
    siteDevices.forEach(d => {
      if (d.warrantyExpiry) {
        const w = calculateWarrantyStatus(d.warrantyExpiry)
        if (w.isExpired) warrantiesExpired++
        else if (w.isNearEnd) warrantiesExpiring++
      }
    })

    return {
      siteId: activeSite.id,
      siteName: activeSite.name,
      totalDevices: siteDevices.length,
      onlineDevices,
      offlineDevices: offlineDevices.length,
      healthPercentage,
      totalZones: siteZones.length,
      criticalFaults,
      warrantiesExpiring,
      warrantiesExpired,
      mapUploaded,
      needsAttention: criticalFaults.length > 0 || !mapUploaded
    }
  }, [activeSite, siteDevices, siteZones, siteFaults, mapUploaded])


  const handleMapUpload = async (imageUrl: string, locationName: string) => {
    // Reuse map upload logic, keeping it simple for dashboard
    // In a real app, we'd share this logic via a hook
    if (!activeSiteId) return

    try {
      // Assume direct upload for now or handle base64
      // For simplicity in this refactor, we are focusing on the layout
      // Re-implementing the core mutation call:
      const { url } = await (async () => {
        if (imageUrl.startsWith('data:')) {
          const fetchRes = await fetch(imageUrl)
          const blob = await fetchRes.blob()
          const file = new File([blob], `map-${Date.now()}.jpg`, { type: 'image/jpeg' })
          const formData = new FormData()
          formData.append('file', file)
          formData.append('bucket', 'map-data')
          formData.append('fileName', `${activeSiteId}/${Date.now()}-map.jpg`)

          const res = await fetch('/api/upload-image', { method: 'POST', body: formData })
          if (!res.ok) throw new Error('Upload failed')
          return await res.json()
        }
        return { url: imageUrl }
      })()

      await trpcUtils.client.location.create.mutate({
        siteId: activeSiteId,
        name: locationName,
        type: 'base',
        imageUrl: url
      })

      await trpcUtils.location.list.invalidate({ siteId: activeSiteId })
      addToast({ type: 'success', title: 'Map Uploaded', message: 'Dashboard updated' })
    } catch (e) {
      console.error(e)
      addToast({ type: 'error', title: 'Upload Failed', message: 'Could not upload map' })
    }
  }


  // -- Render --

  if (!activeSite) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        {/* Fallback if no site is selected/exists */}
        <PanelEmptyState
          icon={Building2}
          title="No Site Selected"
          description="Please select or create a site to view the Home Base."
          action={<Button onClick={() => window.location.reload()}>Reload</Button>}
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--color-background-elevated)]">
      {/* Top Search Island - Modified to be simpler for Home Base view */}
      <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3 relative z-10">
        <SearchIsland
          position="top"
          fullWidth={true}
          title="Home Base"
          subtitle={activeSite.name}
          // Hide metrics that are duplicate of the card overlay? 
          // Or keep them as high level summary. Let's keep a simplified set.
          metrics={activeSiteSummary ? [
            {
              label: 'System Health',
              value: `${activeSiteSummary.healthPercentage}%`,
              color: activeSiteSummary.healthPercentage > 90 ? 'var(--color-success)' : 'var(--color-warning)'
            },
            {
              label: 'Total Devices',
              value: activeSiteSummary.totalDevices,
            }
          ] : []}
        />
      </div>

      {/* Main Content: Split View (Map Left, Details Right) */}
      <div className="flex-1 min-h-0 p-4 pt-0 md:pl-4 flex flex-row overflow-hidden">

        {/* Map Area */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] relative shadow-xl">
          {mapUploaded ? (
            <MapCanvas
              mapImageUrl={mapImageUrl}
              devices={siteDevices.map(d => ({
                id: d.id,
                x: d.x || 0,
                y: d.y || 0,
                type: d.type,
                deviceId: d.deviceId,
                status: d.status,
                signal: d.signal || 100
              }))}
              // Read-only / view mode mostly
              mode="select"
              showZones={true}
              zones={(siteZones || []).map((z: any) => ({
                id: z.id,
                name: z.name,
                color: z.color || '#cccccc',
                polygon: z.polygon
              }))}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-[var(--color-surface-subtle)]">
              <div className="max-w-md w-full">
                <MapUpload onMapUpload={handleMapUpload} />
              </div>
            </div>
          )}
        </div>

        {/* Right Side Panel */}
        <ResizablePanel
          defaultWidth={400}
          minWidth={320}
          maxWidth={600}
          className="flex-shrink-0 h-full ml-4"
        >
          {activeSite && activeSiteSummary ? (
            <SiteDetailsPanel
              site={activeSite}
              devices={siteDevices}
              zones={siteZones}
              rules={[]} // Fetch rules if needed, empty for now
              criticalFaults={activeSiteSummary.criticalFaults || []}
              warrantiesExpiring={activeSiteSummary.warrantiesExpiring || 0}
              warrantiesExpired={activeSiteSummary.warrantiesExpired || 0}
              mapUploaded={mapUploaded}
              healthPercentage={activeSiteSummary.healthPercentage}
              onlineDevices={activeSiteSummary.onlineDevices || 0}
              offlineDevices={(activeSiteSummary.totalDevices || 0) - (activeSiteSummary.onlineDevices || 0)}
              missingDevices={0} // Fetch if needed
              onAddSite={() => { }} // Placeholder
              onEditSite={() => { }} // Placeholder
              onRemoveSite={() => { }} // Placeholder
              onImportSites={() => { }} // Placeholder
              onExportSites={() => { }} // Placeholder
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl">
              <span className="text-[var(--color-text-muted)]">Loading details...</span>
            </div>
          )}
        </ResizablePanel>
      </div>
    </div>
  )
}
