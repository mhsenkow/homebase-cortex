/**
 * Rules & Overrides Section
 * 
 * Main area: Rule list (left side)
 * Right panel: Rule details when selected, or new rule form when nothing is selected
 * 
 * AI Note: Support rule patterns like:
 * - IF motion in Zone C THEN set Zones A+B+C to 25%
 * - IF no motion for 30 minutes THEN return to BMS
 * - IF daylight > 120fc THEN dim to minimum
 * 
 * Plain language labels, trigger → condition → action builder.
 */

'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import dynamic from 'next/dynamic'
import { SearchIsland } from '@/components/layout/SearchIsland'
import { MapViewToggle, type MapViewMode } from '@/components/shared/MapViewToggle'
import { MapUpload } from '@/components/map/MapUpload'
import { RulesList } from '@/components/rules/RulesList'
import { RulesPanel } from '@/components/rules/RulesPanel'
import { ResizablePanel } from '@/components/layout/ResizablePanel'
import { useRules } from '@/lib/DomainContext'
import { useZones } from '@/lib/DomainContext'
import { useDevices } from '@/lib/DomainContext'
import { useSite } from '@/lib/SiteContext'
import { Rule } from '@/lib/mockRules'
import { useMap } from '@/lib/MapContext'
import { useMapUpload } from '@/lib/useMapUpload'
import { useToast } from '@/lib/ToastContext'

// Dynamically import RulesZoneCanvas to avoid SSR issues with Konva
const RulesZoneCanvas = dynamic(() => import('@/components/rules/RulesZoneCanvas').then(mod => ({ default: mod.RulesZoneCanvas })), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <div className="text-[var(--color-text-muted)]">Loading map...</div>
    </div>
  ),
})

export default function RulesPage() {
  const { rules, addRule, updateRule, deleteRule } = useRules()
  const { zones } = useZones()
  const { devices } = useDevices()
  const { activeSiteId } = useSite()
  const { addToast } = useToast()

  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  // Use cached map data from context
  const { mapData } = useMap()
  const mapImageUrl = mapData.mapImageUrl
  const vectorData = mapData.vectorData
  const mapUploaded = mapData.mapUploaded

  const [viewMode, setViewMode] = useState<MapViewMode>('list')
  const [selectedZoneName, setSelectedZoneName] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(true)
  const [showOverrides, setShowOverrides] = useState(true)
  const [showSchedules, setShowSchedules] = useState(true)
  const listContainerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Map data is now loaded from MapContext - no need to load it here
  const { refreshMapData } = useMap()
  const { uploadMap, uploadVectorData } = useMapUpload()

  const handleMapUpload = async (imageUrl: string) => {
    try {
      await uploadMap(imageUrl)
      // Refresh map data to show the new upload
      await refreshMapData()
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Upload Failed',
        message: error.message || 'Failed to upload map'
      })
    }
  }

  const handleVectorDataUpload = async (data: any) => {
    try {
      await uploadVectorData(data)
      // Refresh map data to show the new upload
      await refreshMapData()
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Upload Failed',
        message: error.message || 'Failed to upload vector data'
      })
    }
  }

  const selectedRule = useMemo(() => {
    return rules.find(r => r.id === selectedRuleId) || null
  }, [rules, selectedRuleId])

  // Handle zone selection from map
  const handleZoneSelect = (zoneName: string | null) => {
    setSelectedZoneName(zoneName)
  }

  // Filter rules based on selected zone, search, and type filters
  const filteredRules = useMemo(() => {
    let filtered = rules

    // Apply type filters (rules, overrides, schedules)
    filtered = filtered.filter(rule => {
      if (rule.ruleType === 'rule' && !showRules) return false
      if (rule.ruleType === 'override' && !showOverrides) return false
      if (rule.ruleType === 'schedule' && !showSchedules) return false
      return true
    })

    // Apply search filter - partial match on all fields
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(rule => {
        // Build searchable text from all rule fields
        const searchableText = [
          rule.name,
          rule.description,
          rule.ruleType,
          rule.condition.zone,
          rule.condition.deviceId,
          rule.targetName,
          rule.action.zones?.join(' '),
          rule.action.devices?.join(' '),
          rule.trigger,
          rule.enabled ? 'enabled' : 'disabled',
        ].filter(Boolean).join(' ').toLowerCase()

        return searchableText.includes(query)
      })
    }

    // Apply zone filter (only if zone name is provided and zones are loaded)
    if (selectedZoneName && zones.length > 0) {
      filtered = filtered.filter(rule =>
        rule.condition.zone === selectedZoneName ||
        rule.targetName === selectedZoneName ||
        rule.action.zones?.includes(selectedZoneName) ||
        false
      )
    }

    return filtered
  }, [rules, searchQuery, selectedZoneName, zones.length, showRules, showOverrides, showSchedules])

  // Prepare zones for map
  const mapZones = useMemo(() => {
    return zones.map(z => ({
      id: z.id,
      name: z.name,
      color: z.color,
      polygon: z.polygon,
    }))
  }, [zones])

  // Prepare devices for map
  const mapDevices = useMemo(() => {
    return devices.map(d => {
      // Convert DeviceType enum to simplified type for canvas
      let simplifiedType: 'fixture' | 'motion' | 'light-sensor' = 'fixture'
      if (d.type === 'motion' || d.type?.includes('motion')) {
        simplifiedType = 'motion'
      } else if (d.type === 'light-sensor' || d.type?.includes('light-sensor')) {
        simplifiedType = 'light-sensor'
      } else {
        // All fixture types map to 'fixture'
        simplifiedType = 'fixture'
      }

      return {
        id: d.id,
        x: d.x || 0,
        y: d.y || 0,
        type: simplifiedType,
        deviceId: d.deviceId,
        status: d.status,
        signal: d.signal,
        location: d.location,
      }
    })
  }, [devices])

  // Get zones that have rules
  const zonesWithRules = useMemo(() => {
    const zoneSet = new Set<string>()
    rules.forEach(rule => {
      if (rule.condition.zone) zoneSet.add(rule.condition.zone)
      if (rule.targetName) zoneSet.add(rule.targetName)
      rule.action.zones?.forEach(z => zoneSet.add(z))
    })
    return Array.from(zoneSet)
  }, [rules])

  const handleSave = (ruleData: Partial<Rule>) => {
    if (selectedRule) {
      // Update existing rule
      updateRule(selectedRule.id, ruleData as Partial<Rule>)
    } else {
      // Create new rule
      addRule({
        name: ruleData.name || 'New Rule',
        description: ruleData.description,
        ruleType: ruleData.ruleType || 'rule',
        targetType: ruleData.targetType || 'zone',
        targetId: ruleData.targetId,
        targetName: ruleData.targetName,
        trigger: ruleData.trigger || 'motion',
        condition: ruleData.condition || {},
        action: ruleData.action || { zones: [] },
        overrideBMS: ruleData.overrideBMS || false,
        enabled: ruleData.enabled !== undefined ? ruleData.enabled : true,
      })
      // Clear selection after creating - panel will reset to create new state
      setSelectedRuleId(null)
    }
  }

  const handleCancel = () => {
    setSelectedRuleId(null)
  }

  const handleDelete = (ruleId: string) => {
    deleteRule(ruleId)
    if (selectedRuleId === ruleId) {
      setSelectedRuleId(null)
    }
  }

  // Handle clicking outside the list and panel to deselect
  const handleMainContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // Deselect if clicking outside both the list container and panel
    if (
      listContainerRef.current &&
      panelRef.current &&
      !listContainerRef.current.contains(target) &&
      !panelRef.current.contains(target)
    ) {
      setSelectedRuleId(null)
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Top Search Island - In flow */}
      <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3">
        <SearchIsland
          position="top"
          fullWidth={true}
          title="Rules, Overrides & Scheduling"
          subtitle="Create automation rules, overrides, and schedules for lighting control"
          placeholder="Search rules or type 'create rule' or 'create schedule'..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          onActionDetected={(action) => {
            if (action.id === 'create-rule' || action.id === 'create-schedule') {
              setSelectedRuleId(null) // This will show the create form in RulesPanel
            }
          }}
        />
      </div>

      {/* Main Content: Rules List/Map + Details Panel */}
      <div
        className="main-content-area flex-1 flex min-h-0 gap-2 md:gap-4 page-padding-x"
        style={{ overflow: 'visible' }}
        onClick={handleMainContentClick}
      >
        {/* Rules List/Map - Left Side */}
        <div
          ref={listContainerRef}
          className="flex-1 min-w-0 flex flex-col"
        >
          {/* View Toggle and Type Filters */}
          <div className="mb-3 flex items-center justify-between gap-3">
            {/* Left side: View Toggle */}
            <MapViewToggle currentView={viewMode} onViewChange={setViewMode} />

            {/* Right side: Type Filter Toggles */}
            <div className="flex items-center gap-3">
              {/* Type Filter Toggles */}
              <div className="flex items-center gap-1 p-0.5 bg-[var(--color-surface-subtle)] rounded-lg border border-[var(--color-border-subtle)]">
                <Toggle
                  pressed={showRules}
                  onPressedChange={setShowRules}
                  size="sm"
                  title="Show/Hide Rules"
                >
                  <span className="hidden sm:inline">Rules</span>
                  <span className="sm:hidden">R</span>
                </Toggle>
                <Toggle
                  pressed={showOverrides}
                  onPressedChange={setShowOverrides}
                  size="sm"
                  title="Show/Hide Overrides"
                >
                  <span className="hidden sm:inline">Overrides</span>
                  <span className="sm:hidden">O</span>
                </Toggle>
                <Toggle
                  pressed={showSchedules}
                  onPressedChange={setShowSchedules}
                  size="sm"
                  title="Show/Hide Schedules"
                >
                  <span className="hidden sm:inline">Schedules</span>
                  <span className="sm:hidden">S</span>
                </Toggle>
              </div>

              {selectedZoneName && viewMode === 'map' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedZoneName(null)}
                  className="text-xs md:text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-2 py-1 h-auto hover:bg-[var(--color-surface-subtle)]"
                  title="Clear zone filter"
                >
                  <span className="hidden sm:inline">Clear filter</span>
                  <span className="sm:hidden">Clear</span>
                </Button>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-h-0">
            {viewMode === 'list' ? (
              <div className="fusion-card overflow-hidden h-full flex flex-col">
                <RulesList
                  rules={filteredRules}
                  selectedRuleId={selectedRuleId}
                  onRuleSelect={setSelectedRuleId}
                  searchQuery={searchQuery}
                />
              </div>
            ) : (
              <div className="fusion-card overflow-hidden h-full flex flex-col rounded-2xl shadow-[var(--shadow-strong)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] relative">
                {!mapUploaded ? (
                  <div className="w-full h-full">
                    <MapUpload onMapUpload={handleMapUpload} onVectorDataUpload={handleVectorDataUpload} />
                  </div>
                ) : (
                  <div className="w-full h-full rounded-2xl overflow-hidden">
                    <RulesZoneCanvas
                      zones={mapZones}
                      devices={mapDevices}
                      rules={rules}
                      mapImageUrl={mapImageUrl}
                      vectorData={vectorData}
                      selectedZoneName={selectedZoneName}
                      onZoneSelect={handleZoneSelect}
                      devicesData={devices}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Rules Panel - Right Side */}
        <div ref={panelRef}>
          <ResizablePanel
            defaultWidth={384}
            minWidth={320}
            maxWidth={512}
            collapseThreshold={200}
            storageKey="rules_panel"
          >
            <RulesPanel
              selectedRule={selectedRule}
              onSave={handleSave}
              onCancel={handleCancel}
              onDelete={handleDelete}
            />
          </ResizablePanel>
        </div>
      </div>
    </div>
  )
}
