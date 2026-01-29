/**
 * Firmware Updates Section
 * 
 * Main area: Firmware campaign list (left side)
 * Right panel: Campaign details when selected, or new campaign form when nothing is selected
 * 
 * AI Note: Manages firmware update campaigns that can target specific device types and sites.
 * Shows progress, device status, and allows scheduling updates.
 */

'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { SearchIsland } from '@/components/layout/SearchIsland'
import { FirmwareCampaignList } from '@/components/firmware/FirmwareCampaignList'
import { FirmwareCampaignPanel } from '@/components/firmware/FirmwareCampaignPanel'
import { ResizablePanel } from '@/components/layout/ResizablePanel'
import { useSite } from '@/lib/SiteContext'
import { trpc } from '@/lib/trpc/client'
import { CreateFirmwareCampaignModal } from '@/components/firmware/CreateFirmwareCampaignModal'
import { ConfirmationModal } from '@/components/shared/ConfirmationModal'
import { useConfirm } from '@/lib/hooks/useConfirm'

export default function FirmwarePage() {
  const { activeSiteId } = useSite()
  const searchParams = useSearchParams()
  const campaignIdFromUrl = searchParams.get('id')
  const confirm = useConfirm()
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [includeCompleted, setIncludeCompleted] = useState(false)

  // Set selected campaign from URL
  useEffect(() => {
    if (campaignIdFromUrl) {
      setSelectedCampaignId(campaignIdFromUrl)
    }
  }, [campaignIdFromUrl])

  // Fetch campaigns from database
  const { data: campaigns, refetch: refetchCampaigns, isLoading } = trpc.firmware.listCampaigns.useQuery(
    { siteId: activeSiteId || undefined, includeCompleted },
    { enabled: true, refetchOnWindowFocus: false }
  )

  // Get selected campaign details
  const { data: selectedCampaign, refetch: refetchSelectedCampaign } = trpc.firmware.getCampaign.useQuery(
    { id: selectedCampaignId! },
    { enabled: !!selectedCampaignId }
  )

  // Update campaign status mutation
  const updateCampaignStatusMutation = trpc.firmware.updateCampaignStatus.useMutation({
    onSuccess: () => {
      refetchCampaigns()
      if (selectedCampaignId) {
        refetchSelectedCampaign()
      }
    },
  })

  // Delete campaign mutation
  const deleteCampaignMutation = trpc.firmware.deleteCampaign.useMutation({
    onSuccess: () => {
      refetchCampaigns()
      setSelectedCampaignId(null)
    },
  })

  // Filter campaigns based on search
  const filteredCampaigns = useMemo(() => {
    if (!campaigns) return []

    if (!searchQuery.trim()) return campaigns

    const query = searchQuery.toLowerCase().trim()
    return campaigns.filter(campaign => {
      const searchableText = [
        campaign.name,
        campaign.description,
        campaign.version,
        (campaign as any).site?.name,
        campaign.status,
      ].filter(Boolean).join(' ').toLowerCase()

      return searchableText.includes(query)
    })
  }, [campaigns, searchQuery])

  const handleCreateCampaign = () => {
    setShowCreateModal(true)
  }

  const handleCampaignCreated = () => {
    setShowCreateModal(false)
    refetchCampaigns()
  }

  const handleStartCampaign = async (id: string) => {
    await updateCampaignStatusMutation.mutateAsync({
      id,
      status: 'IN_PROGRESS',
    })
  }

  const handlePauseCampaign = async (id: string) => {
    await updateCampaignStatusMutation.mutateAsync({
      id,
      status: 'PENDING',
    })
  }

  const handleCancelCampaign = async (id: string) => {
    const isConfirmed = await confirm({
      title: 'Cancel Campaign',
      message: 'Are you sure you want to cancel this campaign? This cannot be undone.',
      confirmLabel: 'Cancel Campaign',
      variant: 'danger'
    })

    if (isConfirmed) {
      await updateCampaignStatusMutation.mutateAsync({
        id,
        status: 'CANCELLED',
      })
    }
  }

  const handleDeleteCampaign = async (id: string) => {
    setCampaignToDelete(id)
    setIsDeleteModalOpen(true)
  }

  const handleConfirmDeleteCampaign = async () => {
    if (!campaignToDelete) return
    await deleteCampaignMutation.mutateAsync({ id: campaignToDelete })
    setIsDeleteModalOpen(false)
    setCampaignToDelete(null)
    if (selectedCampaignId === campaignToDelete) {
      setSelectedCampaignId(null)
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Top Search Island - matches People / Groups layout */}
      <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3 relative">
        <SearchIsland
          position="top"
          fullWidth={true}
          showActions={true}
          title="Firmware Campaigns"
          subtitle="Manage device updates and track deployment progress."
          placeholder="Search campaigns..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>

      {/* Main Content - same structure as People / Groups */}
      <div className="main-content-area flex-1 flex min-h-0 gap-2 md:gap-4 page-padding-x">
        {/* Left: Campaign list in card */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 relative rounded-2xl shadow-[var(--shadow-strong)] border border-[var(--color-border-subtle)] overflow-hidden bg-[var(--color-surface)]">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <span className="text-[var(--color-text-muted)] flex items-center gap-2">
                  <span className="animate-spin">⟳</span> Loading campaigns...
                </span>
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center mb-6 shadow-[var(--shadow-md)]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">No Firmware Campaigns</h3>
                <p className="text-[var(--color-text-muted)] max-w-xs mb-8">
                  {searchQuery
                    ? 'No campaigns match your search criteria. Try adjusting your filters.'
                    : 'Create a campaign to update device firmware across your sites.'}
                </p>
                {!searchQuery && (
                  <Button onClick={handleCreateCampaign} variant="secondary" size="md">
                    Create Your First Campaign
                  </Button>
                )}
              </div>
            ) : (
              <div className="h-full overflow-y-auto">
                <FirmwareCampaignList
                  campaigns={filteredCampaigns}
                  selectedCampaignId={selectedCampaignId}
                  onSelectCampaign={setSelectedCampaignId}
                  onStartCampaign={handleStartCampaign}
                  onPauseCampaign={handlePauseCampaign}
                  onCancelCampaign={handleCancelCampaign}
                  onDeleteCampaign={handleDeleteCampaign}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - same ResizablePanel pattern as People / Groups */}
        <ResizablePanel
          defaultWidth={384}
          minWidth={320}
          maxWidth={512}
          collapseThreshold={200}
          storageKey="firmware_panel"
        >
          <FirmwareCampaignPanel
            campaign={selectedCampaign}
            onStartCampaign={handleStartCampaign}
            onPauseCampaign={handlePauseCampaign}
            onCancelCampaign={handleCancelCampaign}
            onDeleteCampaign={handleDeleteCampaign}
            onRefresh={() => {
              refetchCampaigns()
              if (selectedCampaignId) {
                refetchSelectedCampaign()
              }
            }}
            includeCompleted={includeCompleted}
            onIncludeCompletedChange={setIncludeCompleted}
            onCreateCampaign={handleCreateCampaign}
          />
        </ResizablePanel>
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <CreateFirmwareCampaignModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCampaignCreated}
        />
      )}

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setCampaignToDelete(null)
        }}
        onConfirm={handleConfirmDeleteCampaign}
        title="Delete Campaign"
        message={campaignToDelete ? `Are you sure you want to delete this campaign? This action cannot be undone.` : ''}
        variant="danger"
        confirmLabel="Delete Campaign"
      />
    </div>
  )
}
