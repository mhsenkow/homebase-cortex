'use client'

import { SearchIsland } from '@/components/layout/SearchIsland'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { MapPin } from 'lucide-react'
import { SiteImageCard } from './SiteImageCard'

interface SitesGridViewProps {
  displaySites: any[]
  viewToggle?: React.ReactNode | null
  onSiteSelect: (siteId: string) => void
  hideHeader?: boolean
  selectedSiteId?: string | null
}

export function SitesGridView({
  displaySites,
  viewToggle,
  onSiteSelect,
  hideHeader = false,
  selectedSiteId = null,
}: SitesGridViewProps) {
  const gridContent = (
    <div className={`flex-1 min-h-0 ${hideHeader ? 'p-0 overflow-auto' : 'p-4 pt-0 overflow-auto'}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 h-full min-h-[400px] auto-rows-fr">
        {displaySites.map((site: any) => {
          const summary = typeof site.healthPercentage === 'number' ? site : null
          const warrantyTag =
            (summary?.warrantiesExpiring || 0) + (summary?.warrantiesExpired || 0) > 0
              ? `${summary?.warrantiesExpiring || 0} expiring, ${summary?.warrantiesExpired || 0} expired`
              : null

          return (
            <Card
              key={site.id}
              className={`flex flex-col overflow-hidden cursor-pointer hover:border-[var(--color-primary)]/50 hover:shadow-lg transition-all duration-200 min-h-0 ${
                selectedSiteId === site.id ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30' : ''
              }`}
              onClick={() => onSiteSelect(site.id)}
            >
              <div className="flex-1 flex flex-col min-h-0 p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <SiteImageCard siteId={site.id} sizeClass="w-16 h-16 md:w-20 md:h-20" />
                  <div className="flex items-center gap-1">
                    <MapPin size={12} className="text-[var(--color-text-muted)]" />
                    {!summary?.mapUploaded && (
                      <Badge variant="outline" className="text-[10px]">No map</Badge>
                    )}
                  </div>
                </div>
                <h3 className="font-semibold text-[var(--color-text)] truncate">{site.name}</h3>
                <p className="text-xs text-[var(--color-text-muted)] truncate">
                  {[site.city, site.state].filter(Boolean).join(', ') || '-'}
                </p>
                {site.manager && (
                  <p className="text-xs text-[var(--color-text-soft)] mt-1 truncate">{site.manager}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span style={{ color: 'var(--color-success)' }}>
                    Health {(summary?.healthPercentage ?? 100)}%
                  </span>
                  <span>Devices {summary?.totalDevices ?? 0}</span>
                  <span>Offline {summary?.offlineDevices ?? 0}</span>
                  <span>Zones {summary?.totalZones ?? 0}</span>
                </div>

                {warrantyTag && (
                  <div className="mt-2 text-[10px] text-[var(--color-warning)]">{warrantyTag}</div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )

  if (hideHeader) {
    return <div className="h-full flex flex-col min-h-0 overflow-hidden">{gridContent}</div>
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--color-background-elevated)]">
      <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3">
        <SearchIsland
          position="top"
          fullWidth={true}
          title="Sites"
          subtitle={`${displaySites.length} site${displaySites.length !== 1 ? 's' : ''}`}
          metrics={[
            { label: 'Total Sites', value: displaySites.length },
            {
              label: 'Avg Health',
              value: displaySites.length > 0
                ? `${Math.round(displaySites.reduce((a, s) => a + (s.healthPercentage || 100), 0) / displaySites.length)}%`
                : '-',
            },
          ]}
          headerActions={viewToggle ?? undefined}
        />
      </div>
      {gridContent}
    </div>
  )
}
