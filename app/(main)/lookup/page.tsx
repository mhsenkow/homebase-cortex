/**
 * Device Lookup Section
 * 
 * Main area: Device list (left side) with toggle for Table/Devices Map/Zones Map views
 * Right panel: Device profile with image placeholder and detailed information
 * 
 * AI Note: I2QR details include build date, CCT, warranty status, parts list.
 * Global search from TopBar should integrate with this.
 */

'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { SearchIsland } from '@/components/layout/SearchIsland'
import { DeviceList } from '@/components/lookup/DeviceList'
import { DeviceProfilePanel } from '@/components/lookup/DeviceProfilePanel'
import { ViewToggle, type ViewMode } from '@/components/lookup/ViewToggle'
import { ResizablePanel, type ResizablePanelRef } from '@/components/layout/ResizablePanel'
import { MapUpload } from '@/components/map/MapUpload'
import { useDevices } from '@/lib/DomainContext'
import { useZones } from '@/lib/DomainContext'
import { useSite } from '@/lib/SiteContext'
import { useToast } from '@/lib/ToastContext'
import { useConfirm } from '@/lib/hooks/useConfirm'
import { ComponentModal } from '@/components/shared/ComponentModal'
import { ManualDeviceEntry } from '@/components/discovery/ManualDeviceEntry'
import { EditDeviceModal } from '@/components/lookup/EditDeviceModal'
import { Component, Device, DeviceType } from '@/lib/mockData'
import { fuzzySearch } from '@/lib/fuzzySearch'
import { useMap } from '@/lib/MapContext'
import { useMapUpload } from '@/lib/useMapUpload'
import { generateComponentsForFixture, generateWarrantyExpiry, isFixtureType } from '@/lib/deviceUtils'

// Dynamically import MapCanvas and ZoneCanvas to avoid SSR issues with Konva
const MapCanvas = dynamic(() => import('@/components/map/MapCanvas').then(mod => ({ default: mod.MapCanvas })), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <div className="text-[var(--color-text-muted)]">Loading map...</div>
    </div>
  ),
})

const ZoneCanvas = dynamic(() => import('@/components/map/ZoneCanvas').then(mod => ({ default: mod.ZoneCanvas })), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <div className="text-[var(--color-text-muted)]">Loading map...</div>
    </div>
  ),
})

export default function LookupPage() {
  const { devices, addDevice, removeDevice, updateDevice } = useDevices()
  const { zones } = useZones()
  const { activeSiteId, activeSite } = useSite()
  const { addToast } = useToast()
  const confirm = useConfirm()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null)
  const [componentParentDevice, setComponentParentDevice] = useState<Device | null>(null)
  // Use cached map data from context
  const { mapData } = useMap()
  const mapImageUrl = mapData.mapImageUrl
  const vectorData = mapData.vectorData
  const mapUploaded = mapData.mapUploaded

  // Handle URL deep linking
  const searchParams = useSearchParams()
  const urlDeviceId = searchParams?.get('id')

  useEffect(() => {
    if (urlDeviceId) {
      // Find device by ID or database ID
      const device = devices.find(d => d.id === urlDeviceId || d.deviceId === urlDeviceId)
      if (device) {
        setSelectedDeviceId(device.id)
      }
    }
  }, [urlDeviceId, devices])

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<ResizablePanelRef>(null)

  // Shared zoom state between map views
  const [sharedScale, setSharedScale] = useState(1)
  const [sharedStagePosition, setSharedStagePosition] = useState({ x: 0, y: 0 })

  // Action handlers
  const handleManualEntry = useCallback(() => setShowManualEntry(true), [])

  const handleQRScan = useCallback(async () => {
    // Mock QR code scanning - simulate finding a device
    const mockDeviceId = `FLX-${Math.floor(Math.random() * 9000) + 1000}`
    const mockSerial = `SN-2024-${Math.floor(Math.random() * 9000) + 1000}-A${Math.floor(Math.random() * 9) + 1}`

    // Show a mock "scanning" message
    const confirmed = await confirm({
      title: 'QR Code Scanned',
      message: `Device ID: ${mockDeviceId}\nSerial: ${mockSerial}\n\nWould you like to add this device?`,
      confirmLabel: 'Add Device',
      cancelLabel: 'Cancel'
    })

    if (confirmed) {
      const deviceId = `device-${Date.now()}`
      const warrantyExpiry = generateWarrantyExpiry()

      const newDevice: Device = {
        id: deviceId,
        deviceId: mockDeviceId,
        serialNumber: mockSerial,
        type: 'fixture-16ft-power-entry',
        signal: Math.floor(Math.random() * 40) + 50,
        status: 'online',
        location: 'Scanned via QR',
        x: undefined,
        y: undefined,
        // Generate components for fixtures
        components: generateComponentsForFixture(deviceId, mockSerial, warrantyExpiry),
        warrantyStatus: 'Active',
        warrantyExpiry,
      }
      addDevice(newDevice)
      addToast({
        type: 'success',
        title: 'Device Added',
        message: `Device ${newDevice.deviceId} added successfully`
      })
    }
  }, [addDevice, confirm, addToast])

  const handleImport = useCallback(() => {
    // Create a hidden file input
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string
          let importedDevices: Device[] = []

          if (file.name.endsWith('.json')) {
            importedDevices = JSON.parse(text)
          } else if (file.name.endsWith('.csv')) {
            // Simple CSV parsing (mock)
            const lines = text.split('\n').filter(line => line.trim())
            importedDevices = lines.slice(1).map(line => {
              const values = line.split(',').map(v => v.trim())
              const deviceId = `device-${Date.now()}-${Math.random()}`
              const serialNumber = values[1] || `SN-${Date.now()}`
              const deviceType = (values[2] || 'fixture') as 'fixture' | 'motion' | 'light-sensor'
              const warrantyExpiry = generateWarrantyExpiry()

              return {
                id: deviceId,
                deviceId: values[0] || `FLX-${Math.floor(Math.random() * 9000) + 1000}`,
                serialNumber,
                type: deviceType,
                signal: parseInt(values[3]) || Math.floor(Math.random() * 40) + 50,
                status: (values[4] || 'online') as 'online' | 'offline' | 'missing',
                location: values[5] || 'Imported',
                x: undefined,
                y: undefined,
                // Generate components for fixtures
                components: deviceType.startsWith('fixture-')
                  ? generateComponentsForFixture(deviceId, serialNumber, warrantyExpiry)
                  : undefined,
                warrantyStatus: 'Active',
                warrantyExpiry,
              } as Device
            })
          }

          // Add imported devices (with components if they don't have them)
          importedDevices.forEach(device => {
            const deviceId = `device-${Date.now()}-${Math.random()}`
            const warrantyExpiry = device.warrantyExpiry || generateWarrantyExpiry()

            addDevice({
              ...device,
              id: deviceId,
              // Ensure fixtures have components
              components: isFixtureType(device.type) && !device.components
                ? generateComponentsForFixture(deviceId, device.serialNumber, warrantyExpiry)
                : device.components,
              warrantyStatus: device.warrantyStatus || 'Active',
              warrantyExpiry,
            })
          })

          addToast({
            type: 'success',
            title: 'Import Successful',
            message: `Successfully imported ${importedDevices.length} device(s)`
          })
        } catch (error) {
          addToast({
            type: 'error',
            title: 'Import Failed',
            message: 'Error importing file. Please check the format.'
          })
          console.error('Import error:', error)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [addDevice])

  const handleExport = useCallback(() => {
    if (devices.length === 0) {
      addToast({
        type: 'warning',
        title: 'No Devices',
        message: 'No devices to export'
      })
      return
    }

    // Export as JSON
    const dataStr = JSON.stringify(devices, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `devices-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [devices])

  // Handle action events from DeviceList empty state (for backward compatibility)
  useEffect(() => {
    window.addEventListener('manualEntry', handleManualEntry)
    window.addEventListener('qrScan', handleQRScan)
    window.addEventListener('importList', handleImport)
    window.addEventListener('exportList', handleExport)

    return () => {
      window.removeEventListener('manualEntry', handleManualEntry)
      window.removeEventListener('qrScan', handleQRScan)
      window.removeEventListener('importList', handleImport)
      window.removeEventListener('exportList', handleExport)
    }
  }, [handleManualEntry, handleQRScan, handleImport, handleExport])

  const handleAddDevice = (deviceData: { deviceId: string; serialNumber: string; type: DeviceType }) => {
    const deviceId = `device-${Date.now()}`
    const warrantyExpiry = generateWarrantyExpiry()

    // Ensure type is explicitly set
    if (!deviceData.type) {
      console.error('Device type is missing in deviceData:', deviceData)
      addToast({
        type: 'error',
        title: 'Validation Error',
        message: 'Device type is required'
      })
      return
    }

    const newDevice: Device = {
      id: deviceId,
      deviceId: deviceData.deviceId,
      serialNumber: deviceData.serialNumber,
      type: deviceData.type, // Explicitly set type
      signal: Math.floor(Math.random() * 40) + 50,
      battery: !isFixtureType(deviceData.type) ? Math.floor(Math.random() * 40) + 60 : undefined,
      status: 'online',
      location: 'Manually Added',
      x: undefined,
      y: undefined,
      // Generate components for fixtures
      components: isFixtureType(deviceData.type)
        ? generateComponentsForFixture(deviceId, deviceData.serialNumber, warrantyExpiry)
        : undefined,
      warrantyStatus: 'Active',
      warrantyExpiry,
    }

    console.log('Creating device with type:', newDevice.type, 'Full device:', newDevice)
    addDevice(newDevice)
    addToast({
      type: 'success',
      title: 'Device Added',
      message: `Device ${newDevice.deviceId} added successfully`
    })
    setShowManualEntry(false)
  }

  // Map data is now loaded from MapContext - no need to load it here
  const { refreshMapData } = useMap()
  const { uploadMap, uploadVectorData, isUploading } = useMapUpload()

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

  // Check if we should select a device from sessionStorage (e.g., from faults page)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDeviceId = sessionStorage.getItem('selectedDeviceId')
      if (savedDeviceId) {
        const device = devices.find(d => d.id === savedDeviceId)
        if (device) {
          setSelectedDeviceId(savedDeviceId)
        }
        sessionStorage.removeItem('selectedDeviceId')
      }
    }
  }, [devices])

  const selectedDevice = useMemo(() => {
    return devices.find(d => d.id === selectedDeviceId) || null
  }, [devices, selectedDeviceId])

  // Filter devices based on search query - fuzzy match on all fields
  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return devices

    const query = searchQuery.trim()
    // Use fuzzy search for better matching with typo tolerance
    const results = fuzzySearch(
      query,
      devices,
      ['deviceId', 'serialNumber', 'location', 'zone', 'type', 'status'],
      20 // min score threshold
    )
    return results.map(r => r.item)
  }, [devices, searchQuery])

  // Prepare devices for map views
  const mapDevices = useMemo(() => {
    return filteredDevices.map(d => ({
      id: d.id,
      x: d.x || 0,
      y: d.y || 0,
      type: d.type,
      deviceId: d.deviceId,
      status: d.status,
      signal: d.signal,
      location: d.location,
      locked: d.locked || false,
      orientation: d.orientation,
      components: d.components,
    }))
  }, [filteredDevices])

  // Prepare zones for zones map view
  const mapZones = useMemo(() => {
    return zones.map(z => ({
      id: z.id,
      name: z.name,
      color: z.color,
      polygon: z.polygon,
    }))
  }, [zones])

  const handleComponentClick = (component: Component, parentDevice: Device) => {
    setSelectedComponent(component)
    setComponentParentDevice(parentDevice)
  }

  const handleCloseComponentModal = () => {
    setSelectedComponent(null)
    setComponentParentDevice(null)
  }

  const renderMainContent = () => {
    if (viewMode === 'table') {
      return (
        <div className="fusion-card overflow-hidden h-full flex flex-col">
          <DeviceList
            devices={filteredDevices}
            selectedDeviceId={selectedDeviceId}
            onDeviceSelect={setSelectedDeviceId}
            searchQuery={searchQuery}
            onEdit={setEditingDevice}
          />
        </div>
      )
    }

    if (viewMode === 'devices-map') {
      if (!mapUploaded) {
        return (
          <div className="fusion-card overflow-hidden h-full flex flex-col">
            <MapUpload onMapUpload={handleMapUpload} onVectorDataUpload={handleVectorDataUpload} />
          </div>
        )
      }

      return (
        <div className="fusion-card overflow-hidden h-full flex flex-col rounded-2xl shadow-[var(--shadow-strong)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] relative">
          <div className="w-full h-full rounded-2xl overflow-hidden">
            <MapCanvas
              onDeviceSelect={setSelectedDeviceId}
              selectedDeviceId={selectedDeviceId}
              mapImageUrl={mapImageUrl}
              vectorData={vectorData}
              highlightDeviceId={selectedDeviceId}
              mode="select"
              devices={mapDevices}
              devicesData={filteredDevices}
              externalScale={sharedScale}
              externalStagePosition={sharedStagePosition}
              onScaleChange={setSharedScale}
              onStagePositionChange={setSharedStagePosition}
            />
          </div>
        </div>
      )
    }

    if (viewMode === 'zones-map') {
      if (!mapUploaded) {
        return (
          <div className="fusion-card overflow-hidden h-full flex flex-col">
            <MapUpload onMapUpload={handleMapUpload} onVectorDataUpload={handleVectorDataUpload} />
          </div>
        )
      }

      return (
        <div className="fusion-card overflow-hidden h-full flex flex-col rounded-2xl shadow-[var(--shadow-strong)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] relative">
          <div className="w-full h-full rounded-2xl overflow-hidden">
            <ZoneCanvas
              onDeviceSelect={setSelectedDeviceId}
              selectedDeviceId={selectedDeviceId}
              mapImageUrl={mapImageUrl}
              vectorData={vectorData}
              devices={mapDevices}
              zones={mapZones}
              selectedZoneId={null}
              onZoneSelect={() => { }}
              mode="select"
              devicesData={filteredDevices}
              externalScale={sharedScale}
              externalStagePosition={sharedStagePosition}
              onScaleChange={setSharedScale}
              onStagePositionChange={setSharedStagePosition}
            />
          </div>
        </div>
      )
    }

    return null
  }

  // Open panel when device is selected on tablet/mobile
  useEffect(() => {
    if (selectedDeviceId && panelRef.current && typeof window !== 'undefined' && window.innerWidth < 1024) {
      // Open panel when device is selected on tablet/mobile
      if (panelRef.current.isCollapsed) {
        panelRef.current.open()
      }
    }
  }, [selectedDeviceId])

  // Handle clicking outside the list and panel to deselect
  const handleMainContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // Deselect if clicking outside the list container (panel handles its own clicks)
    if (
      listContainerRef.current &&
      !listContainerRef.current.contains(target)
    ) {
      // Only deselect if panel is collapsed (closed)
      if (panelRef.current?.isCollapsed) {
        setSelectedDeviceId(null)
      }
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Top Search Island - In flow */}
      <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3">
        <SearchIsland
          position="top"
          fullWidth={true}
          title="Device Lookup"
          subtitle="Search for devices by ID or serial number"
          placeholder="Enter device ID or serial number..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>

      {/* Main Content: Device List/Map + Profile Panel */}
      <div
        className="main-content-area flex-1 flex min-h-0 gap-2 md:gap-4 page-padding-x"
        style={{ overflow: 'visible' }}
        onClick={handleMainContentClick}
      >
        {/* Main View - Left Side */}
        <div
          ref={listContainerRef}
          className="flex-1 min-w-0 flex flex-col"
        >
          {/* View Toggle - Top of main content */}
          <div className="mb-2 md:mb-3 flex items-center justify-between">
            <ViewToggle currentView={viewMode} onViewChange={setViewMode} />
          </div>

          {/* Content Area */}
          <div className="flex-1 min-h-0">
            {renderMainContent()}
          </div>
        </div>

        {/* Device Profile Panel - Right Side */}
        <ResizablePanel
          ref={panelRef}
          defaultWidth={384}
          minWidth={320}
          maxWidth={512}
          collapseThreshold={200}
          storageKey="lookup_panel"
          showCloseButton={true}
        >
          <DeviceProfilePanel
            device={selectedDevice}
            siteManagerName={activeSite?.manager ?? null}
            onDeviceSelect={(device) => setSelectedDeviceId(device?.id || null)}
            onComponentClick={handleComponentClick}
            onManualEntry={handleManualEntry}
            onQRScan={handleQRScan}
            onImport={handleImport}
            onExport={handleExport}
            onDelete={(deviceId) => {
              removeDevice(deviceId)
              setSelectedDeviceId(null)
            }}
            onEdit={setEditingDevice}
          />
        </ResizablePanel>
      </div>

      {/* Component Modal */}
      <ComponentModal
        component={selectedComponent}
        parentDevice={componentParentDevice}
        isOpen={selectedComponent !== null}
        onClose={handleCloseComponentModal}
      />

      {/* Manual Entry Modal */}
      <ManualDeviceEntry
        isOpen={showManualEntry}
        onClose={() => setShowManualEntry(false)}
        onAdd={handleAddDevice}
      />

      {/* Edit Device Modal */}
      <EditDeviceModal
        isOpen={!!editingDevice}
        onClose={() => setEditingDevice(null)}
        device={editingDevice}
        onSave={(deviceId, updates) => {
          updateDevice(deviceId, updates)
          setEditingDevice(null)
        }}
      />
    </div>
  )
}
