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
import { usePeople } from '@/lib/hooks/usePeople'
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
import { DashboardGridContent } from '@/components/dashboard/DashboardGridContent'
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

import { SiteImageCard } from '@/components/dashboard/SiteImageCard'
import { useDashboardViewStore } from '@/lib/stores/dashboardViewStore'

export default function DashboardPage() {
  const router = useRouter()
  const { sites, activeSiteId, setActiveSite, activeSite, addSite, updateSite, removeSite } = useSite()
  const { viewMode, setViewMode } = useDashboardViewStore()
  const { devices } = useDevices()
  const { zones } = useZones()
  // const { rules } = useRules() // Unused
  const trpcUtils = trpc.useUtils()
  const { addToast } = useToast()
  const { people, fetchPeople } = usePeople()

  // Fetch people when site changes
  useEffect(() => {
    if (activeSiteId) {
      fetchPeople(activeSiteId)
    }
  }, [activeSiteId])

  // Site summaries for grid view (all sites)
  const { data: siteSummariesData = [] } = trpc.site.listWithSummaries.useQuery(undefined, {
    enabled: viewMode === 'grid' || sites.length > 0,
  })

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


  // View toggle is in PageTitle (top left, next to breadcrumbs)

  // -- Render: Grid View (sites mode) - grid + right panel for selected site --
  if (viewMode === 'grid') {
    const displaySites = siteSummariesData.length > 0 ? siteSummariesData : sites.map(s => ({
      ...s,
      totalDevices: 0,
      onlineDevices: 0,
      offlineDevices: 0,
      healthPercentage: 100,
      totalZones: 0,
      criticalFaults: 0,
      warrantiesExpiring: 0,
      warrantiesExpired: 0,
      mapUploaded: false,
    }))

    return (
      <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--color-background-elevated)]">
        <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3">
          <SearchIsland
            position="top"
            fullWidth={true}
            title="Sites"
            subtitle={displaySites.length > 0 ? `${displaySites.length} site${displaySites.length !== 1 ? 's' : ''}` : 'Multi-site overview'}
            metrics={displaySites.length > 0 ? [
              { label: 'Total Sites', value: displaySites.length },
              {
                label: 'Avg Health',
                value: `${Math.round(displaySites.reduce((a, s) => a + (s.healthPercentage || 100), 0) / displaySites.length)}%`,
              },
            ] : []}
          />
        </div>

        <div className="flex-1 min-h-0 p-4 pt-0 md:pl-4 flex flex-row overflow-hidden">
          {/* Grid of site cards */}
          <div className="flex-1 min-h-0 overflow-auto">
            <DashboardGridContent
              displaySites={displaySites}
              viewToggle={null}
              onSiteSelect={(siteId) => setActiveSite(siteId)}
              hideHeader
              selectedSiteId={activeSiteId}
            />
          </div>

          {/* Right panel - site details (same as map/focused mode) */}
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
                rules={[]}
                criticalFaults={activeSiteSummary.criticalFaults || []}
                warrantiesExpiring={activeSiteSummary.warrantiesExpiring || 0}
                warrantiesExpired={activeSiteSummary.warrantiesExpired || 0}
                mapUploaded={mapUploaded}
                healthPercentage={activeSiteSummary.healthPercentage}
                onlineDevices={activeSiteSummary.onlineDevices || 0}
                offlineDevices={(activeSiteSummary.totalDevices || 0) - (activeSiteSummary.onlineDevices || 0)}
                missingDevices={0}
                onAddSite={() => {}}
                onEditSite={() => {}}
                onRemoveSite={() => {}}
                onImportSites={() => {}}
                onExportSites={() => {}}
              />
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl">
                <Building2 size={48} className="text-[var(--color-text-muted)] mb-4" />
                <p className="text-sm font-medium text-[var(--color-text)]">Select a site</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1 text-center">
                  Click a site card to view details
                </p>
              </div>
            )}
          </ResizablePanel>
        </div>
      </div>
    )
  }

  // -- Render: Map View (requires active site) --
  if (!activeSite) {
    return (
      <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--color-background-elevated)]">
        <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3">
          <SearchIsland
            position="top"
            fullWidth={true}
            title="Home Base"
            subtitle="Select a site"
          />
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <PanelEmptyState
            icon={Building2}
            title="No Site Selected"
            description="Switch to grid view to see all sites, or select a site to view the map."
            action={
              <Button onClick={() => setViewMode('grid')}>View all sites</Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--color-background-elevated)]">
      <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3 relative z-10">
        <SearchIsland
          position="top"
          fullWidth={true}
          title="Home Base"
          subtitle={activeSite.name}
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

      <div className="flex-1 min-h-0 p-4 pt-0 md:pl-4 flex flex-row overflow-hidden">
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
              mode="select"
              showZones={true}
              zones={(siteZones || []).map((z: any) => ({
                id: z.id,
                name: z.name,
                color: z.color || '#cccccc',
                polygon: z.polygon
              }))}
              people={people.map(p => ({
                id: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                x: p.x || 0,
                y: p.y || 0,
                imageUrl: p.imageUrl,
                role: p.role,
                email: p.email
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
              rules={[]}
              criticalFaults={activeSiteSummary.criticalFaults || []}
              warrantiesExpiring={activeSiteSummary.warrantiesExpiring || 0}
              warrantiesExpired={activeSiteSummary.warrantiesExpired || 0}
              mapUploaded={mapUploaded}
              healthPercentage={activeSiteSummary.healthPercentage}
              onlineDevices={activeSiteSummary.onlineDevices || 0}
              offlineDevices={(activeSiteSummary.totalDevices || 0) - (activeSiteSummary.onlineDevices || 0)}
              missingDevices={0}
              onAddSite={() => { }}
              onEditSite={() => { }}
              onRemoveSite={() => { }}
              onImportSites={() => { }}
              onExportSites={() => { }}
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
