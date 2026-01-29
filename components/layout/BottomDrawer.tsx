/**
 * Bottom Drawer Component
 * 
 * Slide-up drawer for:
 * - Page-specific status information
 * - Notifications
 * - Background tasks (exports, syncs)
 * 
 * AI Note: This should be collapsible and show summary info
 * when collapsed, full details when expanded.
 */

'use client'

import { ChevronUp, ChevronDown, AlertTriangle, Layers, Network, Workflow, Search, Home, X } from 'lucide-react'
import { useState, useMemo, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useNotifications } from '@/lib/NotificationContext'
import { useRouter } from 'next/navigation'
import { useDevices } from '@/lib/DomainContext'
import { useZones } from '@/lib/DomainContext'
import { useRules } from '@/lib/DomainContext'
import Link from 'next/link'
import { FaultCategory, assignFaultCategory } from '@/lib/faultDefinitions'
import { useZoomContext } from '@/lib/MapContext'

interface BottomDrawerProps {
  children?: React.ReactNode
}

const typeIcons: Record<string, any> = {
  fault: AlertTriangle,
  zone: Layers,
  bacnet: Network,
  rule: Workflow,
  device: Search,
  system: Home,
}

export function BottomDrawer({ children }: BottomDrawerProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const lastClickTime = useRef(0)
  const lastClickY = useRef(0)
  const pathname = usePathname()
  const { notifications, unreadCount, markAsRead, dismissNotification } = useNotifications()
  const { devices } = useDevices()
  const { zones } = useZones()
  const { rules } = useRules()
  const router = useRouter()
  const { zoomLevel, interactionHint, modeHint } = useZoomContext()

  // Track if component is mounted (client-side only)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Get recent notifications (show more for horizontal scroll)
  const recentNotifications = notifications.slice(0, 10)

  // Calculate page-specific status
  const pageStatus = useMemo(() => {
    if (pathname?.startsWith('/lookup')) {
      return `${devices.length.toLocaleString()} device${devices.length !== 1 ? 's' : ''}`
    }
    if (pathname?.startsWith('/map')) {
      return `${devices.length.toLocaleString()} device${devices.length !== 1 ? 's' : ''} found`
    }
    if (pathname?.startsWith('/faults')) {
      const faults = devices.filter(d =>
        d.status === 'missing' || d.status === 'offline' || (d.battery !== undefined && d.battery < 20)
      ).length
      return `${faults} fault${faults !== 1 ? 's' : ''} detected`
    }
    if (pathname?.startsWith('/rules')) {
      return `${rules.length} rule${rules.length !== 1 ? 's' : ''}`
    }
    if (pathname?.startsWith('/zones')) {
      return `${zones.length} zone${zones.length !== 1 ? 's' : ''} configured`
    }
    if (pathname?.startsWith('/bacnet')) {
      // Count zones with BACnet mappings from localStorage (only after mount to avoid hydration mismatch)
      if (isMounted && typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem('fusion_bacnet_mappings')
          if (saved) {
            const mappings = JSON.parse(saved)
            const connected = mappings.filter((m: any) => m.bacnetObjectId && m.status === 'connected').length
            const total = mappings.length
            if (total > 0) {
              return `${connected} of ${total} zone${total !== 1 ? 's' : ''} connected`
            }
          }
        } catch (e) {
          // Fallback if parsing fails
        }
      }
      // Fallback: show zones count (limited to 12 as per BACnet page logic)
      // This ensures server and initial client render match
      const zoneCount = Math.min(zones.length, 12)
      return `${zoneCount} zone${zoneCount !== 1 ? 's' : ''}`
    }
    if (pathname?.startsWith('/dashboard')) {
      const offline = devices.filter(d => d.status === 'offline' || d.status === 'missing').length
      return `${devices.length.toLocaleString()} device${devices.length !== 1 ? 's' : ''}${offline > 0 ? ` — ${offline} offline` : ''}`
    }
    return null
  }, [pathname, devices, zones, rules, isMounted])

  return (
    <div
      className={`
        w-full
        bg-[var(--color-surface)] backdrop-blur-xl border-t border-[var(--color-border-subtle)] 
        transition-all duration-300 ease-out flex-shrink-0
        ${isExpanded ? 'h-64' : 'h-12'}
      `}
      style={{ zIndex: 'var(--z-drawer)' }}
    >
      {/* Drawer Header - Always visible */}
      <button
        onClick={(e) => {
          const currentTime = Date.now()
          const timeDiff = currentTime - lastClickTime.current
          const yDiff = Math.abs(e.clientY - lastClickY.current)

          // Check for double-click (within 300ms and within 50px vertical)
          if (timeDiff > 0 && timeDiff < 300 && yDiff < 50) {
            // Double-click detected - toggle
            setIsExpanded(!isExpanded)
            lastClickTime.current = 0 // Reset
          } else {
            // Single click - just toggle
            setIsExpanded(!isExpanded)
            lastClickTime.current = currentTime
            lastClickY.current = e.clientY
          }
        }}
        onDoubleClick={(e) => {
          e.preventDefault()
          setIsExpanded(!isExpanded)
          lastClickTime.current = 0 // Reset after double-click
        }}
        className="w-full h-12 flex items-center justify-between px-4 md:px-6 hover:bg-[var(--color-surface-subtle)] transition-colors cursor-pointer"
        title={isExpanded ? "Click or double-click to collapse" : "Click or double-click to expand"}
      >


        <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
          <span className="text-sm font-medium text-[var(--color-text)] whitespace-nowrap">
            Status
          </span>

          {/* Interaction/Mode Hints take priority over Page Status */}
          {(interactionHint || modeHint) ? (
            <span className="text-xs font-medium text-[var(--color-primary)] truncate transition-all duration-300">
              {interactionHint || modeHint}
            </span>
          ) : (
            pageStatus && (
              <span className="text-xs text-[var(--color-text-muted)] truncate hidden sm:inline">
                {pageStatus}
              </span>
            )
          )}

          {/* Zoom Level - Only on map page */}
          {pathname?.startsWith('/map') && (
            <span className="text-xs text-[var(--color-text-muted)] border-l border-[var(--color-border-subtle)] pl-2 ml-2 hidden sm:inline opacity-70">
              {zoomLevel}%
            </span>
          )}

          {unreadCount > 0 && (
            <span className="text-xs text-[var(--color-primary)] whitespace-nowrap ml-auto md:ml-0">
              • {unreadCount} new{unreadCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown size={18} className="text-[var(--color-text-muted)]" />
        ) : (
          <ChevronUp size={18} className="text-[var(--color-text-muted)]" />
        )}
      </button>

      {/* Drawer Content - Visible when expanded */}
      {isExpanded && (
        <div className="h-[calc(16rem-3rem)] overflow-hidden p-3 flex flex-col">
          {children || (
            <div className="flex flex-col h-full">
              {/* Horizontal scrolling cards */}
              {recentNotifications.length > 0 ? (
                <div className="flex-1 overflow-x-auto overflow-y-hidden pb-2">
                  <div className="flex gap-3 h-full items-stretch">
                    {recentNotifications.map((notification) => {
                      const Icon = typeIcons[notification.type] || AlertTriangle
                      const timeAgo = Math.floor((Date.now() - notification.timestamp.getTime()) / (1000 * 60))
                      const timeText = timeAgo < 1 ? 'Just now' : timeAgo < 60 ? `${timeAgo}m` : `${Math.floor(timeAgo / 60)}h`

                      return (
                        <div
                          key={notification.id}
                          className={`
                            w-56 sm:w-64 flex-shrink-0 p-3 rounded-lg border transition-all cursor-pointer group
                            ${notification.read
                              ? 'bg-[var(--color-surface-subtle)] border-[var(--color-border-subtle)]'
                              : 'bg-[var(--color-primary-soft)] border-[var(--color-primary)]/40'
                            }
                            hover:shadow-[var(--shadow-soft)] hover:border-[var(--color-primary)]/50
                          `}
                          onClick={() => {
                            markAsRead(notification.id)
                            router.push(notification.link)
                            setIsExpanded(false)
                          }}
                        >
                          <div className="flex flex-col h-full">
                            {/* Header with icon and dismiss */}
                            <div className="flex items-start justify-between mb-2">
                              <div className={`p-1.5 rounded-lg flex-shrink-0 ${notification.read ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-primary)]/20'}`}>
                                <Icon size={14} className={notification.read ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-primary)]'} />
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  dismissNotification(notification.id)
                                }}
                                className="p-1 rounded-md hover:bg-[var(--color-surface)] transition-colors opacity-0 group-hover:opacity-100"
                                title="Dismiss"
                              >
                                <X size={12} className="text-[var(--color-text-muted)]" />
                              </button>
                            </div>

                            {/* Title */}
                            <h4 className={`text-xs font-semibold mb-1.5 line-clamp-2 leading-snug ${notification.read ? 'text-[var(--color-text)]' : 'text-[var(--color-text)]'}`}>
                              {notification.title}
                            </h4>

                            {/* Message */}
                            <p className="text-xs text-[var(--color-text-muted)] line-clamp-3 mb-2 flex-1 leading-relaxed">
                              {notification.message}
                            </p>

                            {/* Footer with time and unread indicator */}
                            <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--color-border-subtle)]">
                              <span className="text-xs text-[var(--color-text-soft)]">
                                {timeText}
                              </span>
                              {!notification.read && (
                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {/* View All link as last card */}
                    <Link
                      href="/notifications"
                      className="w-64 flex-shrink-0 p-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-all flex items-center justify-center group"
                      onClick={(e) => {
                        e.stopPropagation()
                        setIsExpanded(false)
                      }}
                    >
                      <span className="text-xs font-medium text-[var(--color-primary)] group-hover:underline">
                        View All →
                      </span>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
                  No notifications
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

