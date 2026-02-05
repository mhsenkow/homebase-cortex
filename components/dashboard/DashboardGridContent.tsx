'use client'

import { SearchIsland } from '@/components/layout/SearchIsland'
import { Button } from '@/components/ui/Button'
import { PanelEmptyState } from '@/components/shared/PanelEmptyState'
import { Building2 } from 'lucide-react'
import { SitesGridView } from './SitesGridView'

interface DashboardGridContentProps {
  displaySites: any[]
  viewToggle?: React.ReactNode | null
  onSiteSelect: (siteId: string) => void
  /** When true, only render the grid (no header) - for embedded use with parent header */
  hideHeader?: boolean
  /** Currently selected site ID (for highlight in grid) */
  selectedSiteId?: string | null
}

function EmptySitesView({ viewToggle, hideHeader }: { viewToggle?: React.ReactNode | null; hideHeader?: boolean }) {
  if (hideHeader) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <PanelEmptyState
          icon={Building2}
          title="No Sites Yet"
          description="Add a site to get started."
          action={<Button onClick={() => window.location.reload()}>Reload</Button>}
        />
      </div>
    )
  }
  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--color-background-elevated)]">
      <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3">
        <SearchIsland
          position="top"
          fullWidth={true}
          title="Sites"
          subtitle="Multi-site overview"
          headerActions={viewToggle ?? undefined}
        />
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <PanelEmptyState
          icon={Building2}
          title="No Sites Yet"
          description="Add a site to get started."
          action={<Button onClick={() => window.location.reload()}>Reload</Button>}
        />
      </div>
    </div>
  )
}

export function DashboardGridContent({
  displaySites,
  viewToggle,
  onSiteSelect,
  hideHeader = false,
  selectedSiteId = null,
}: DashboardGridContentProps) {
  if (displaySites.length === 0) {
    return <EmptySitesView viewToggle={viewToggle} hideHeader={hideHeader} />
  }
  return (
    <SitesGridView
      displaySites={displaySites}
      viewToggle={viewToggle}
      onSiteSelect={onSiteSelect}
      hideHeader={hideHeader}
      selectedSiteId={selectedSiteId}
    />
  )
}
