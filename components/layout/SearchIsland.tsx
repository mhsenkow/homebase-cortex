/**
 * Search Island Component
 * 
 * Reusable floating search island with site selector.
 * Can be positioned at top or bottom, full width or centered.
 * 
 * AI Note: Use this component for consistent search islands across pages.
 */

'use client'

import { Search, Layers, Sparkles, ArrowUp, ArrowDown, TrendingUp, TrendingDown, Activity, Clock, X } from 'lucide-react'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearch } from '@/lib/SearchContext'
import { useDevices } from '@/lib/DomainContext'
import { fuzzySearch, type SearchResult } from '@/lib/fuzzySearch'
import { getRecentSearches, addRecentSearch, getSearchSuggestions, clearRecentSearches } from '@/lib/recentSearches'
import { usePathname } from 'next/navigation'

interface Metric {
  label: string
  value: string | number
  color?: string
  trend?: 'up' | 'down' | 'stable'
  delta?: number
  description?: string
  icon?: React.ReactNode
  onClick?: () => void
}

interface SearchIslandProps {
  position?: 'top' | 'bottom'
  fullWidth?: boolean
  showActions?: boolean
  placeholder?: string
  title?: string
  subtitle?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  onLayersClick?: () => void
  filterCount?: number
  onActionDetected?: (action: { id: string; label: string }) => void
  metrics?: Metric[]
  /** Optional slot for custom header actions (e.g. view toggle) */
  headerActions?: React.ReactNode
}

export function SearchIsland({
  position = 'bottom',
  fullWidth = true,
  showActions = false,
  placeholder = 'Search, input a task, or ask a question...',
  title,
  subtitle,
  searchValue,
  onSearchChange,
  onLayersClick,
  filterCount = 0,
  onActionDetected,
  metrics = [],
  headerActions
}: SearchIslandProps) {
  const [internalSearchQuery, setInternalSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [focused, setFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const { detectAction, getPageActions, pageType } = useSearch()
  // Devices may not be available on all pages - handle gracefully
  const devicesContext = useDevices()
  const devices = devicesContext?.devices || []
  const pathname = usePathname()

  // Use controlled value if provided, otherwise use internal state
  const searchQuery = searchValue !== undefined ? searchValue : internalSearchQuery
  const setSearchQuery = onSearchChange || setInternalSearchQuery

  // Detect actions from search query
  const detectedAction = useMemo(() => {
    if (!searchQuery.trim()) return null
    return detectAction(searchQuery)
  }, [searchQuery, detectAction])

  // Notify parent when action is detected
  useEffect(() => {
    if (detectedAction && onActionDetected) {
      onActionDetected(detectedAction)
    }
  }, [detectedAction, onActionDetected])

  // Get recent searches and fuzzy-matched devices
  const suggestions = useMemo(() => {
    const query = searchQuery.trim()

    // Get recent searches
    const recentSearches = (!focused && !showSuggestions) ? [] : getSearchSuggestions(query, 3)

    // Get fuzzy-matched devices (only if query exists)
    let deviceResults: SearchResult<any>[] = []
    if (query && devices.length > 0 && (focused || showSuggestions)) {
      deviceResults = fuzzySearch(
        query,
        devices,
        ['deviceId', 'serialNumber', 'location', 'zone', 'type', 'status'],
        20 // min score
      ).slice(0, 5) // Limit to top 5
    }

    return {
      recent: recentSearches,
      devices: deviceResults,
    }
  }, [searchQuery, devices, focused, showSuggestions])

  // Show suggestions when focused or typing
  useEffect(() => {
    setShowSuggestions(focused || searchQuery.length > 0)
  }, [focused, searchQuery])

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback((suggestion: string) => {
    setSearchQuery(suggestion)
    setShowSuggestions(false)
    setFocused(false)
    addRecentSearch(suggestion, pageType)
    searchInputRef.current?.blur()
  }, [setSearchQuery, pageType])

  // Handle Enter key - save search and execute
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (selectedSuggestionIndex >= 0) {
        // Select highlighted suggestion
        const allSuggestions = [
          ...suggestions.recent.map(s => s.query),
          ...suggestions.devices.map(d => d.item.deviceId || d.item.serialNumber || ''),
        ].filter(Boolean)

        if (allSuggestions[selectedSuggestionIndex]) {
          handleSuggestionSelect(allSuggestions[selectedSuggestionIndex])
        }
      } else if (searchQuery.trim()) {
        // Save search and execute action if detected
        addRecentSearch(searchQuery, pageType)
        if (detectedAction) {
          detectedAction.action()
          setSearchQuery('')
        }
      }
      setShowSuggestions(false)
      setFocused(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const totalSuggestions = suggestions.recent.length + suggestions.devices.length
      setSelectedSuggestionIndex(prev =>
        prev < totalSuggestions - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setFocused(false)
      searchInputRef.current?.blur()
    }
  }, [selectedSuggestionIndex, suggestions, searchQuery, detectedAction, handleSuggestionSelect, setSearchQuery, pageType])

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
        setFocused(false)
      }
    }

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSuggestions])

  const containerClass = position === 'top'
    ? fullWidth
      ? 'w-full px-4 md:pl-5'
      : 'max-w-3xl mx-auto px-4'
    : fullWidth
      ? 'w-full px-4'
      : 'max-w-4xl mx-auto px-4'

  // Position class - pages handle fixed positioning via wrappers
  const positionClass = position === 'top'
    ? ''
    : ''

  return (
    <div className={`${containerClass} ${positionClass}`} style={{ position: 'relative', zIndex: showSuggestions ? 9999 : 'auto' }}>
      <div className="fusion-card backdrop-blur-xl border border-[var(--color-primary)]/20 search-island py-3 md:py-4 px-3 md:px-5">
        {/* Layout: Title + Metrics (stacked on mobile) + Search + Actions */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3 lg:gap-4">
          {/* Title Section */}
          {title && (
            <div className="flex-shrink-0 min-w-0 w-full md:w-auto">
              <h1 className="text-base md:text-lg font-bold text-[var(--color-text)] leading-tight truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-[var(--color-text-muted)] leading-tight mt-0.5 line-clamp-1 hidden sm:block">
                  {subtitle}
                </p>
              )}
            </div>
          )}

          {/* Metrics - Grid layout on mobile, horizontal on desktop with progressive sizing */}
          {metrics.length > 0 && (
            <div className="w-full md:w-auto md:flex-shrink md:min-w-0">
              <div className="grid grid-cols-3 sm:grid-cols-3 md:flex md:flex-row gap-1.5 sm:gap-2 md:gap-2 lg:gap-3 md:flex-shrink-0 md:overflow-x-auto md:scrollbar-hide md:-mx-1 md:px-1">
                {metrics.map((metric, index) => (
                  <div
                    key={index}
                    onClick={metric.onClick}
                    className={`flex items-center gap-1 sm:gap-1.5 md:gap-1.5 lg:gap-2 px-2 sm:px-2.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-1.5 lg:py-2 rounded-md sm:rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] ${metric.onClick ? 'cursor-pointer hover:bg-[var(--color-surface)] hover:border-[var(--color-primary)]/30 transition-all duration-200' : ''
                      }`}
                  >
                    {metric.icon && (
                      <div className="flex-shrink-0 hidden sm:block md:w-3 md:h-3 lg:w-4 lg:h-4">
                        {metric.icon}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="text-[10px] sm:text-xs md:text-[10px] lg:text-xs text-[var(--color-text-muted)] leading-tight truncate">
                        {metric.label}
                      </div>
                      <div className="flex items-baseline gap-0.5 sm:gap-1 md:gap-0.5 lg:gap-1.5">
                        <span
                          className="text-sm sm:text-base md:text-sm lg:text-base xl:text-lg font-bold leading-tight truncate"
                          style={{ color: metric.color || 'var(--color-text)' }}
                        >
                          {metric.value}
                        </span>
                        {metric.trend && metric.delta !== undefined && metric.delta !== 0 && (
                          <div className={`flex items-center gap-0.5 text-[9px] sm:text-[10px] md:text-[9px] lg:text-xs font-semibold flex-shrink-0 ${metric.trend === 'up'
                            ? 'text-[var(--color-success)]'
                            : metric.trend === 'down'
                              ? 'text-[var(--color-danger)]'
                              : 'text-[var(--color-text-muted)]'
                            }`}>
                            {metric.trend === 'up' ? (
                              <ArrowUp size={8} className="md:w-2.5 md:h-2.5 lg:w-3 lg:h-3" />
                            ) : metric.trend === 'down' ? (
                              <ArrowDown size={8} className="md:w-2.5 md:h-2.5 lg:w-3 lg:h-3" />
                            ) : null}
                            {Math.abs(metric.delta)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spacer to push search to the right - smaller on larger screens to give more space to search */}
          <div className="flex-1 hidden md:block min-w-0 lg:flex-[0.5] xl:flex-[0.3]" />

          {/* Custom header actions slot (e.g. view toggle) */}
          {headerActions && (
            <div className="flex-shrink-0 flex items-center">
              {headerActions}
            </div>
          )}

          {/* Search - Shrinks when space is constrained, min-width 120px, grows on larger screens */}
          <div className="relative min-w-0 w-full md:w-auto md:flex-shrink md:min-w-[120px] md:flex-[2] lg:flex-[3] xl:flex-[4] xl:max-w-none 2xl:max-w-none" style={{ zIndex: 'var(--z-dropdown)' }}>
            <div className="w-full min-w-0 relative">
              <Search
                size={16}
                className="absolute left-2.5 md:left-3 lg:left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] flex-shrink-0 z-10"
              />
              {detectedAction && (
                <div className="absolute right-2 md:right-3 lg:right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 md:gap-1.5 lg:gap-2 z-10">
                  <Sparkles size={10} className="text-[var(--color-primary)] animate-pulse hidden sm:block md:w-3 md:h-3" />
                  <span className="text-[9px] md:text-[10px] lg:text-xs text-[var(--color-primary)] font-medium bg-[var(--color-primary-soft)] px-1 md:px-1.5 lg:px-2 py-0.5 rounded">
                    {detectedAction.label}
                  </span>
                </div>
              )}
              <input
                ref={searchInputRef}
                type="text"
                placeholder={placeholder}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSelectedSuggestionIndex(-1)
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  setFocused(true)
                  setShowSuggestions(true)
                }}
                onBlur={() => {
                  // Delay to allow click on suggestions
                  setTimeout(() => setFocused(false), 200)
                }}
                className={`w-full pl-9 md:pl-10 lg:pl-12 pr-2 md:pr-3 lg:pr-4 py-2 md:py-2.5 lg:py-3 h-[40px] md:h-[44px] lg:h-[52px] bg-[var(--color-bg-elevated)] border-2 rounded-xl text-xs md:text-sm lg:text-base xl:text-lg font-medium text-[var(--color-text)] placeholder:text-[var(--color-text-soft)] placeholder:font-normal focus:outline-none focus:shadow-[var(--shadow-glow-primary)] transition-all ${detectedAction
                  ? 'border-[var(--color-primary)] pr-20 md:pr-24 lg:pr-32 focus:ring-2 focus:ring-[var(--color-primary)]'
                  : 'border-[var(--color-border-subtle)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]'
                  }`}
              />

              {/* Typeahead Suggestions Dropdown */}
              {showSuggestions && (suggestions.recent.length > 0 || suggestions.devices.length > 0) && (
                <div
                  ref={suggestionsRef}
                  className="absolute top-full left-0 right-0 mt-2 rounded-xl max-h-96 overflow-auto border border-[var(--color-primary)]/30 shadow-[var(--shadow-strong)]"
                  style={{
                    zIndex: 9999,
                    background: 'rgba(9, 11, 17, 0.95)',
                    backdropFilter: 'blur(40px) saturate(200%)',
                    WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 229, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                  }}
                >
                  {/* Recent Searches */}
                  {suggestions.recent.length > 0 && (
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 px-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)]">
                          <Clock size={12} />
                          <span>Recent</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            clearRecentSearches()
                          }}
                          className="text-xs text-[var(--color-text-soft)] hover:text-[var(--color-text)] transition-colors"
                          title="Clear history"
                        >
                          Clear
                        </button>
                      </div>
                      {suggestions.recent.map((recent, idx) => {
                        const isSelected = selectedSuggestionIndex === idx
                        return (
                          <button
                            key={`recent-${idx}`}
                            onClick={() => handleSuggestionSelect(recent.query)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${isSelected
                              ? 'bg-[var(--color-primary-soft)] text-[var(--color-text)]'
                              : 'hover:bg-[var(--color-surface-subtle)] text-[var(--color-text)]'
                              }`}
                          >
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-[var(--color-text-muted)] flex-shrink-0" />
                              <span className="truncate">{recent.query}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Device Matches */}
                  {suggestions.devices.length > 0 && (
                    <div className="p-2 border-t border-[var(--color-border-subtle)]">
                      <div className="px-2 mb-2 text-xs font-semibold text-[var(--color-text-muted)]">
                        Devices
                      </div>
                      {suggestions.devices.map((result, idx) => {
                        const device = result.item
                        const suggestionIdx = suggestions.recent.length + idx
                        const isSelected = selectedSuggestionIndex === suggestionIdx
                        const matchField = result.matchedFields[0] || 'deviceId'

                        return (
                          <button
                            key={`device-${device.id}`}
                            onClick={() => handleSuggestionSelect(device.deviceId || device.serialNumber || '')}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${isSelected
                              ? 'bg-[var(--color-primary-soft)] text-[var(--color-text)]'
                              : 'hover:bg-[var(--color-surface-subtle)] text-[var(--color-text)]'
                              }`}
                          >
                            <div className="flex items-center gap-2">
                              <Search size={14} className="text-[var(--color-primary)] flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold truncate">
                                  {device.deviceId || device.serialNumber}
                                </div>
                                <div className="text-xs text-[var(--color-text-muted)] truncate">
                                  {device.serialNumber && device.deviceId !== device.serialNumber && (
                                    <span>SN: {device.serialNumber}</span>
                                  )}
                                  {device.location && (
                                    <span className="ml-2">• {device.location}</span>
                                  )}
                                  {device.zone && (
                                    <span className="ml-2">• {device.zone}</span>
                                  )}
                                </div>
                                {result.score < 60 && (
                                  <div className="text-[10px] text-[var(--color-text-soft)] mt-0.5">
                                    Fuzzy match ({Math.round(result.score)}%)
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {showActions && (
            <div className="flex-shrink-0">
              <button
                onClick={onLayersClick}
                className="px-3 md:px-4 py-1.5 md:py-2 bg-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] rounded-lg text-xs md:text-sm text-[var(--color-text)] hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-glow-primary)] transition-all flex items-center gap-1.5 md:gap-2 relative h-[36px] md:h-[38px]"
              >
                <Layers size={14} />
                <span className="text-xs md:text-sm hidden sm:inline">Layers</span>
                {filterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--color-primary)] text-[var(--color-text)] text-[10px] md:text-xs flex items-center justify-center font-semibold">
                    {filterCount}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

