/**
 * Site Details Panel Component
 * 
 * Right-side panel showing comprehensive details about a selected site.
 * Displays metrics, faults, warranties, zones, rules, and recent activity.
 * 
 * AI Note: This panel appears when a site card is selected on the dashboard.
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { skipToken } from '@tanstack/react-query'
import { Badge } from '@/components/ui/Badge'
import { Site, useSite } from '@/lib/SiteContext'
import { Device } from '@/lib/mockData'
import { Zone } from '@/lib/DomainContext'
import { Rule } from '@/lib/mockRules'
import { FaultCategory } from '@/lib/faultDefinitions'
import { calculateWarrantyStatus } from '@/lib/warranty'
import { trpc } from '@/lib/trpc/client'
import {
  MapPin,
  Phone,
  User,
  Calendar,
  Activity,
  AlertTriangle,
  Shield,
  Map,
  Zap,
  Layers,
  Workflow,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  ArrowRight,
  Plus,
  Upload,
  Download,
  Building2,
  Trash2,
  Edit2,
  ChevronDown,
  Maximize2
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SiteFocusedModal } from './SiteFocusedContent'
import { ConfirmationModal } from '@/components/shared/ConfirmationModal'
import { PersonToken } from '@/components/people/PersonToken'

interface SiteDetailsPanelProps {
  site: Site | null
  devices: Device[]
  zones: Zone[]
  rules: Rule[]
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
  healthPercentage: number
  onlineDevices: number
  offlineDevices: number
  missingDevices: number
  onAddSite?: () => void
  onEditSite?: (site: Site) => void
  onRemoveSite?: (siteId: string) => void
  onImportSites?: () => void
  onExportSites?: () => void
}

export function SiteDetailsPanel({
  site,
  devices,
  zones,
  rules,
  criticalFaults,
  warrantiesExpiring,
  warrantiesExpired,
  mapUploaded,
  healthPercentage,
  onlineDevices,
  offlineDevices,
  missingDevices,
  onAddSite,
  onEditSite,
  onRemoveSite,
  onImportSites,
  onExportSites,
}: SiteDetailsPanelProps) {
  const router = useRouter()
  const { setActiveSite, sites, activeSiteId } = useSite()

  const handlePersonClick = (personId: string) => {
    router.push(`/people?personId=${personId}`)
  }
  const [isSiteDropdownOpen, setIsSiteDropdownOpen] = useState(false)
  const [siteImageUrl, setSiteImageUrl] = useState<string | null>(null)
  const [imageKey, setImageKey] = useState(0) // Force re-render on update
  const [showFocusedModal, setShowFocusedModal] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  // Fetch people to get manager role
  const { data: sitePeople = [] } = trpc.person.list.useQuery(
    { siteId: site?.id || '' },
    { enabled: !!site?.id }
  )

  // Find person matching manager name to get their role
  const managerPerson = site?.manager && sitePeople.length > 0
    ? sitePeople.find(p => {
      const fullName = `${p.firstName} ${p.lastName}`.trim()
      return fullName === site.manager || p.firstName === site.manager || p.lastName === site.manager
    })
    : null
  const managerRole = managerPerson?.role || 'Manager'

  // Close dropdown when activeSiteId changes (synced from top-right selector)
  useEffect(() => {
    setIsSiteDropdownOpen(false)
  }, [activeSiteId])

  // Validate siteId before querying - use skipToken to completely skip query if invalid
  // Accept both 'site-*' and 'store-*' prefixes for backward compatibility with database
  const isValidSiteId = !!(site?.id && typeof site.id === 'string' && site.id.length > 0)

  // Query site image from database using tRPC
  // Use skipToken to completely skip the query when siteId is invalid
  // Also use enabled to prevent query execution if siteId is invalid
  // Ensure input is always a proper object, never undefined
  const queryInput = isValidSiteId && site?.id ? { siteId: String(site.id).trim() } : skipToken
  const { data: dbImage, isLoading: isDbLoading, refetch: refetchSiteImage } = trpc.image.getSiteImage.useQuery(
    queryInput,
    {
      // Double protection: enabled flag prevents query execution
      enabled: isValidSiteId && !!site?.id && site.id.trim().length > 0,
      // Skip if siteId is invalid to avoid validation errors
      retry: false,
      // Refetch on mount to ensure fresh data
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      // Don't use stale data
      staleTime: 0,
    }
  )

  // Load site image (database first, then client storage fallback)
  useEffect(() => {
    const loadSiteImage = async () => {
      if (!site?.id) {
        setSiteImageUrl(null)
        return
      }

      console.log(`🖼️ Loading image for site: ${site.id}`)
      try {
        // Wait for database query to complete before checking
        if (isDbLoading) {
          console.log(`⏳ Database query still loading for site ${site.id}, waiting...`)
          return
        }

        // First try database (from tRPC query)
        if (dbImage) {
          console.log(`✅ Loaded image from database for site ${site.id}`)
          setSiteImageUrl(dbImage)
          return
        }

        // Only fallback to client storage if database query completed and returned null
        console.log(`ℹ️ No database image found for site ${site.id}, checking client storage...`)
        const { getSiteImage } = await import('@/lib/libraryUtils')
        const image = await getSiteImage(site.id)
        if (image) {
          console.log(`✅ Loaded image from client storage for site ${site.id}`)
          setSiteImageUrl(image)
        } else {
          console.log(`📷 No image found for site ${site.id}, using default`)
          setSiteImageUrl(null)
        }
      } catch (error) {
        console.error(`❌ Failed to load site image for ${site.id}:`, error)
        setSiteImageUrl(null)
      }
    }

    loadSiteImage()

    // Listen for site image updates
    const handleSiteImageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ siteId: string }>
      // Handle both specific siteId events and general events
      if (!customEvent.detail || customEvent.detail?.siteId === site?.id) {
        console.log(`🔄 Site image updated event received for ${site?.id}`)
        setImageKey(prev => prev + 1) // Force re-render

        // Only refetch if we have a valid, non-temporary site ID
        // Check site?.id directly here to avoid stale closure issues
        const currentSiteId = site?.id
        if (currentSiteId) {
          // Temporary IDs are: "site-" followed only by digits (timestamp), or "temp-"
          const isTempId = /^site-\d+$/.test(currentSiteId) || currentSiteId.startsWith('temp-')
          // Also check that the query wasn't configured with skipToken by verifying we have a real database ID format
          const isRealDbId = currentSiteId.length > 15 && !isTempId // Database CUIDs are longer

          if (!isTempId && isRealDbId) {
            console.log(`✅ Refetching image for valid site ID: ${currentSiteId}`)
            refetchSiteImage() // Refetch from database
          } else {
            console.log(`⏭️ Skipping refetch for temporary site ID: ${currentSiteId}`)
          }
        }
        loadSiteImage() // Reload from client storage
      }
    }
    window.addEventListener('siteImageUpdated', handleSiteImageUpdate)
    return () => window.removeEventListener('siteImageUpdated', handleSiteImageUpdate)
  }, [site?.id, dbImage, isDbLoading, refetchSiteImage])

  if (!site) {
    return (
      <div className="w-full md:w-96 md:min-w-[20rem] md:max-w-[32rem] bg-[var(--color-surface)] backdrop-blur-xl rounded-2xl border border-[var(--color-border-subtle)] flex flex-col shadow-[var(--shadow-strong)] overflow-hidden flex-shrink-0 h-full">
        <div className="flex-1 flex flex-col">
          {/* Empty State Content */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 text-center">
            <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-3 md:mb-4 rounded-full bg-[var(--color-surface-subtle)] flex items-center justify-center">
              <Building2 size={32} className="md:w-10 md:h-10 text-[var(--color-text-muted)]" />
            </div>
            <h3 className="text-base md:text-lg font-semibold text-[var(--color-text)] mb-2">
              No Site Selected
            </h3>
            <p className="text-xs md:text-sm text-[var(--color-text-muted)] px-4">
              Select a site from the dashboard to view detailed information
            </p>
          </div>

          {/* Action Buttons Bar */}
          <div className="p-3 md:p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={onAddSite}
                className="px-3 md:px-4 py-1.5 md:py-2 bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] rounded-lg text-xs md:text-sm text-[var(--color-text)] hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-glow-primary)] transition-all flex items-center gap-1.5 md:gap-2"
              >
                <Plus size={14} className="md:w-4 md:h-4" />
                <span className="hidden sm:inline">Add Site</span>
                <span className="sm:hidden">Add</span>
              </button>
              <div className="flex-1" />
              <button
                onClick={onImportSites}
                className="px-3 md:px-4 py-1.5 md:py-2 bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] rounded-lg text-xs md:text-sm text-[var(--color-text)] hover:border-[var(--color-border-strong)] transition-all flex items-center gap-1.5 md:gap-2"
              >
                <Upload size={14} className="md:w-4 md:h-4" />
                <span className="hidden sm:inline">Import</span>
              </button>
              <button
                onClick={onExportSites}
                className="px-3 md:px-4 py-1.5 md:py-2 bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] rounded-lg text-xs md:text-sm text-[var(--color-text)] hover:border-[var(--color-border-strong)] transition-all flex items-center gap-1.5 md:gap-2"
              >
                <Download size={14} className="md:w-4 md:h-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const handleNavigate = (path: string) => {
    setActiveSite(site.id)
    router.push(path)
  }

  const getHealthColor = (percentage: number) => {
    if (percentage >= 95) return 'var(--color-success)'
    if (percentage >= 85) return 'var(--color-warning)'
    return 'var(--color-danger)'
  }

  const getHealthIcon = (percentage: number) => {
    if (percentage >= 95) return <CheckCircle2 size={16} className="text-[var(--color-success)]" />
    if (percentage >= 85) return <AlertCircle size={16} className="text-[var(--color-warning)]" />
    return <XCircle size={16} className="text-[var(--color-danger)]" />
  }

  // Calculate recent activity (mock data for now)
  const recentActivity = [
    ...criticalFaults.slice(0, 2).map(fault => ({
      type: 'fault' as const,
      title: `Fault: ${fault.deviceName}`,
      description: fault.location,
      time: '45 minutes ago',
      icon: AlertTriangle,
      color: 'var(--color-danger)',
      onClick: () => handleNavigate('/faults'),
    })),
    ...(zones.length > 0 ? [{
      type: 'zone' as const,
      title: `Zone configured`,
      description: zones[0]?.name || 'Zone updated',
      time: '1 day ago',
      icon: Layers,
      color: 'var(--color-primary)',
      onClick: () => handleNavigate('/zones'),
    }] : []),
  ].slice(0, 5)

  return (
    <div className="w-full h-full bg-[var(--color-surface)] backdrop-blur-xl rounded-2xl border border-[var(--color-border-subtle)] flex flex-col shadow-[var(--shadow-strong)] overflow-hidden">
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Site Header */}
        <div>
          {/* Site Image */}
          {siteImageUrl && (
            <div className="mb-4 rounded-lg overflow-hidden aspect-video bg-[var(--color-surface-subtle)]">
              <img
                src={siteImageUrl}
                alt={site.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Hide image on error
                  e.currentTarget.style.display = 'none'
                }}
              />
            </div>
          )}
          <div className="flex items-start justify-between mb-2 gap-3">
            {/* Site Dropdown */}
            <div className="flex-1 relative">
              <button
                onClick={() => setIsSiteDropdownOpen(!isSiteDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-transparent hover:bg-[var(--color-surface-subtle)] transition-all duration-200 group"
                style={{
                  borderColor: 'var(--color-border-subtle)',
                  opacity: 0.6,
                }}
              >
                <Building2 size={14} className="md:w-4 md:h-4 text-[var(--color-text-soft)] flex-shrink-0" />
                <span className="text-lg md:text-xl font-bold text-[var(--color-text)] truncate">
                  {activeSiteId ? sites.find(s => s.id === activeSiteId)?.name || site?.name : site?.name || 'Select a site'}
                </span>
                <ChevronDown
                  size={14}
                  className={`md:w-4 md:h-4 text-[var(--color-text-soft)] transition-transform duration-200 flex-shrink-0 ${isSiteDropdownOpen ? 'rotate-180' : ''
                    }`}
                />
              </button>

              {/* Dropdown Menu */}
              {isSiteDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsSiteDropdownOpen(false)}
                  />
                  <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg shadow-[var(--shadow-strong)] z-20 max-h-80 overflow-auto">
                    {sites.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setActiveSite(s.id)
                          setIsSiteDropdownOpen(false)
                        }}
                        className={`w-full text-left px-4 py-2.5 hover:bg-[var(--color-surface-subtle)] transition-colors flex items-center gap-2 ${activeSiteId === s.id
                          ? 'bg-[var(--color-primary)]/10 border-l-2 border-l-[var(--color-primary)]'
                          : ''
                          }`}
                      >
                        <Building2
                          size={14}
                          className={`flex-shrink-0 ${activeSiteId === s.id
                            ? 'text-[var(--color-primary)]'
                            : 'text-[var(--color-text-muted)]'
                            }`}
                        />
                        <span className={`font-medium ${activeSiteId === s.id
                          ? 'text-[var(--color-text)]'
                          : 'text-[var(--color-text-muted)]'
                          }`}>
                          {s.name}
                        </span>
                        {activeSiteId === s.id && (
                          <div className="ml-auto w-2 h-2 rounded-full bg-[var(--color-primary)]" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setShowFocusedModal(true)}
                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-subtle)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                title="Open focused view"
              >
                <Maximize2 size={14} />
              </button>
              <button
                onClick={() => onEditSite?.(site)}
                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-subtle)] transition-colors"
                title="Edit site"
              >
                <Edit2 size={14} className="text-[var(--color-text-muted)]" />
              </button>
              {sites.length > 1 && (
                <></>
              )}
            </div>
          </div>
          <div className="space-y-1.5 md:space-y-2 text-xs md:text-sm text-[var(--color-text-muted)]">
            {site.address && (
              <div className="flex items-center gap-1.5 md:gap-2">
                <MapPin size={12} className="md:w-3.5 md:h-3.5 flex-shrink-0" />
                <span className="break-words">{site.address}, {site.city}, {site.state} {site.zipCode}</span>
              </div>
            )}
            {site.phone && (
              <div className="flex items-center gap-1.5 md:gap-2">
                <Phone size={12} className="md:w-3.5 md:h-3.5 flex-shrink-0" />
                <span>{site.phone}</span>
              </div>
            )}
            {site.manager && (
              <div className="flex items-center gap-1.5 md:gap-2">
                <User size={12} className="md:w-3.5 md:h-3.5 flex-shrink-0" />
                {managerPerson ? (
                  <div className="flex items-center gap-2">
                    <span>{managerRole}:</span>
                    <PersonToken
                      person={managerPerson}
                      size="sm"
                      showName={true}
                      layout="chip"
                      onClick={handlePersonClick}
                      variant="subtle"
                      tooltipDetailLevel="none"
                    />
                  </div>
                ) : (
                  <span>{managerRole}: {site.manager}</span>
                )}
              </div>
            )}
            {site.squareFootage && (
              <div className="flex items-center gap-1.5 md:gap-2">
                <Map size={12} className="md:w-3.5 md:h-3.5 flex-shrink-0" />
                <span>{site.squareFootage.toLocaleString()} sq ft</span>
              </div>
            )}
          </div>
        </div>

        {/* Health Status */}
        <div className="p-3 md:p-4 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)]">
          <div className="flex items-center justify-between mb-2 md:mb-3">
            <div className="flex items-center gap-1.5 md:gap-2">
              <Activity size={16} className="md:w-[18px] md:h-[18px] flex-shrink-0" />
              <span className="text-sm md:text-base font-semibold text-[var(--color-text)]">System Health</span>
            </div>
            {getHealthIcon(healthPercentage)}
          </div>
          <div className="text-2xl md:text-3xl font-bold mb-2" style={{ color: getHealthColor(healthPercentage) }}>
            {healthPercentage}%
          </div>
          <div className="grid grid-cols-3 gap-1.5 md:gap-2 text-xs">
            <div>
              <div className="text-[var(--color-text-muted)]">Online</div>
              <div className="font-semibold text-[var(--color-success)]">{onlineDevices}</div>
            </div>
            <div>
              <div className="text-[var(--color-text-muted)]">Offline</div>
              <div className="font-semibold text-[var(--color-warning)]">{offlineDevices}</div>
            </div>
            <div>
              <div className="text-[var(--color-text-muted)]">Missing</div>
              <div className="font-semibold text-[var(--color-danger)]">{missingDevices}</div>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 md:gap-3">
          <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)]">
            <div className="text-[10px] sm:text-xs text-[var(--color-text-muted)] mb-0.5 md:mb-1">Total Devices</div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-[var(--color-text)]">{devices.length}</div>
          </div>
          <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)]">
            <div className="text-[10px] sm:text-xs text-[var(--color-text-muted)] mb-0.5 md:mb-1">Zones</div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-[var(--color-text)]">{zones.length}</div>
          </div>
          <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)]">
            <div className="text-[10px] sm:text-xs text-[var(--color-text-muted)] mb-0.5 md:mb-1">Rules</div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-[var(--color-text)]">{rules.length}</div>
          </div>
          <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)]">
            <div className="text-[10px] sm:text-xs text-[var(--color-text-muted)] mb-0.5 md:mb-1">Map Status</div>
            <div className="text-[10px] sm:text-xs md:text-sm font-semibold flex items-center gap-0.5 sm:gap-1">
              {mapUploaded ? (
                <Badge variant="success" appearance="soft" className="gap-1">
                  <CheckCircle2 size={12} /> Uploaded
                </Badge>
              ) : (
                <Badge variant="warning" appearance="soft" className="gap-1">
                  <Map size={12} /> Missing
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Critical Faults */}
        {criticalFaults.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-[var(--color-danger)]" />
                <span className="font-semibold text-[var(--color-text)]">Critical Faults</span>
              </div>
              <button
                onClick={() => handleNavigate('/faults')}
                className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1"
              >
                View all
                <ArrowRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {criticalFaults.slice(0, 3).map((fault, idx) => (
                <div
                  key={idx}
                  className="fusion-alert fusion-alert-danger cursor-pointer hover:bg-[var(--color-danger)]/20 transition-colors"
                  onClick={() => handleNavigate('/faults')}
                >
                  <div className="font-medium text-sm text-[var(--color-text)] mb-1">
                    {fault.deviceName}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mb-1 line-clamp-2">
                    {fault.description}
                  </div>
                  <div className="text-xs text-[var(--color-text-soft)] flex items-center gap-1">
                    <MapPin size={10} />
                    {fault.location}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warranty Alerts */}
        {(warrantiesExpiring > 0 || warrantiesExpired > 0) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-[var(--color-warning)]" />
                <span className="font-semibold text-[var(--color-text)]">Warranty Alerts</span>
              </div>
              <button
                onClick={() => handleNavigate('/lookup')}
                className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1"
              >
                View devices
                <ArrowRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {warrantiesExpiring > 0 && (
                <div className="fusion-alert fusion-alert-warning">
                  <div className="text-sm font-medium text-[var(--color-warning)] mb-1">
                    {warrantiesExpiring} warranty{warrantiesExpiring !== 1 ? 'ies' : ''} expiring soon
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    Expiring within 30 days
                  </div>
                </div>
              )}
              {warrantiesExpired > 0 && (
                <div className="fusion-alert fusion-alert-danger">
                  <div className="text-sm font-medium text-[var(--color-danger)] mb-1">
                    {warrantiesExpired} expired warranty{warrantiesExpired !== 1 ? 'ies' : ''}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    Requires attention
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-[var(--color-text-muted)]" />
              <span className="font-semibold text-[var(--color-text)]">Recent Activity</span>
            </div>
            <div className="space-y-2">
              {recentActivity.map((activity, idx) => {
                const Icon = activity.icon
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] cursor-pointer hover:bg-[var(--color-surface)] transition-colors"
                    onClick={activity.onClick}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded bg-[var(--color-surface)] flex-shrink-0">
                        <Icon size={14} style={{ color: activity.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--color-text)] mb-0.5">
                          {activity.title}
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)] mb-1">
                          {activity.description}
                        </div>
                        <div className="text-xs text-[var(--color-text-soft)]">
                          {activity.time}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <div className="font-semibold text-sm text-[var(--color-text)] mb-3">Quick Actions</div>
          <div className="space-y-2">
            <Button
              onClick={() => handleNavigate('/map')}
              variant="primary"
              className="w-full text-left justify-start text-xs md:text-sm"
            >
              <Map size={14} className="md:w-4 md:h-4" />
              <span className="hidden sm:inline">View Map</span>
              <span className="sm:hidden">Map</span>
            </Button>
            <Button
              onClick={() => handleNavigate('/zones')}
              variant="secondary"
              className="w-full text-left justify-start text-xs md:text-sm"
            >
              <Layers size={14} className="md:w-4 md:h-4" />
              <span className="hidden sm:inline">Manage Zones</span>
              <span className="sm:hidden">Zones</span>
            </Button>
            <Button
              onClick={() => handleNavigate('/rules')}
              variant="secondary"
              className="w-full text-left justify-start text-xs md:text-sm"
            >
              <Workflow size={14} className="md:w-4 md:h-4" />
              <span className="hidden sm:inline">Configure Rules</span>
              <span className="sm:hidden">Rules</span>
            </Button>
          </div>
        </div>



      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => {
          if (onRemoveSite) {
            onRemoveSite(site.id)
            setIsDeleteModalOpen(false)
          }
        }}
        title="Delete Site"
        message={`Are you sure you want to remove "${site.name}"? This will delete all associated data including devices, zones, rules, and mappings. This action cannot be undone.`}
        variant="danger"
        confirmLabel="Delete Site"
      />



      {/* Focused Modal */}
      <SiteFocusedModal
        isOpen={showFocusedModal}
        onClose={() => setShowFocusedModal(false)}
        site={site}
        devices={devices}
        zones={zones}
        rules={rules}
        criticalFaults={criticalFaults}
        healthPercentage={healthPercentage}
        onlineDevices={onlineDevices}
        offlineDevices={offlineDevices}
        missingDevices={missingDevices}
        mapUploaded={mapUploaded}
        warrantiesExpiring={warrantiesExpiring}
        warrantiesExpired={warrantiesExpired}
        allSites={sites}
      />
    </div >
  )
}
