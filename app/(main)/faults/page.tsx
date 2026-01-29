/**
 * Faults / Health Section
 * 
 * Main area: Fault list (left side)
 * Right panel: Fault details with troubleshooting steps
 * 
 * AI Note: Shows device health issues, missing devices, offline devices, low battery warnings.
 */

'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Badge } from '@/components/ui/Badge'
import { SelectSwitcher } from '@/components/shared/SelectSwitcher'
import dynamic from 'next/dynamic'
import { SearchIsland } from '@/components/layout/SearchIsland'
import { MapViewToggle, type MapViewMode } from '@/components/shared/MapViewToggle'
import { MapUpload } from '@/components/map/MapUpload'
import { FaultList } from '@/components/faults/FaultList'
import { FaultDetailsPanel } from '@/components/faults/FaultDetailsPanel'
import { ResizablePanel, type ResizablePanelRef } from '@/components/layout/ResizablePanel'
import { useDevices } from '@/lib/DomainContext'
import { useZones } from '@/lib/DomainContext'
import { useSite } from '@/lib/SiteContext'
import { useNotifications } from '@/lib/NotificationContext'
import { useToast } from '@/lib/ToastContext'
import { Device } from '@/lib/mockData'
import { FaultCategory, assignFaultCategory, generateFaultDescription, faultCategories } from '@/lib/faultDefinitions'
import { trpc } from '@/lib/trpc/client'
import { useMap } from '@/lib/MapContext'
import { useMapUpload } from '@/lib/useMapUpload'
import { Droplets, Zap, Thermometer, Plug, Settings, Package, Wrench, Lightbulb, TrendingUp, TrendingDown, AlertTriangle, Clock, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { fuzzySearch } from '@/lib/fuzzySearch'

// Dynamically import FaultsMapCanvas to avoid SSR issues with Konva
const FaultsMapCanvas = dynamic(() => import('@/components/faults/FaultsMapCanvas').then(mod => ({ default: mod.FaultsMapCanvas })), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <div className="text-[var(--color-text-muted)]">Loading map...</div>
    </div>
  ),
})

interface Fault {
  id?: string // Database fault ID (if from database)
  device: Device
  faultType: FaultCategory
  detectedAt: Date
  description: string
  resolved?: boolean // Whether the fault is resolved (archived)
}

export default function FaultsPage() {
  const { devices } = useDevices()
  const { zones } = useZones()
  const { activeSiteId } = useSite()
  const { addNotification, notifications } = useNotifications()
  const { addToast } = useToast()

  // Use cached map data from context
  const { mapData } = useMap()
  const mapImageUrl = mapData.mapImageUrl
  const vectorData = mapData.vectorData
  const mapUploaded = mapData.mapUploaded

  const [selectedFaultId, setSelectedFaultId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<MapViewMode>('list')
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false) // Archive filter
  const [dismissedFaultKeys, setDismissedFaultKeys] = useState<Set<string>>(new Set()) // Track dismissed discovered faults

  // Fetch faults from database
  const { data: dbFaults, refetch: refetchFaults } = trpc.fault.list.useQuery(
    { siteId: activeSiteId || '', includeResolved: showResolved },
    { enabled: !!activeSiteId, refetchOnWindowFocus: false }
  )

  // Create fault mutation
  const createFaultMutation = trpc.fault.create.useMutation({
    onSuccess: () => {
      refetchFaults()
    },
  })

  // Update fault mutation (for resolve/unresolve)
  const updateFaultMutation = trpc.fault.update.useMutation({
    onSuccess: () => {
      refetchFaults()
    },
  })

  // Delete fault mutation
  const deleteFaultMutation = trpc.fault.delete.useMutation({
    onSuccess: () => {
      refetchFaults()
      setSelectedFaultId(null)
      setSelectedDeviceId(null)
    },
  })

  // Handle URL deep linking for faults
  const searchParams = useSearchParams()
  const initialFaultId = searchParams?.get('id')

  useEffect(() => {
    if (initialFaultId) {
      setSelectedFaultId(initialFaultId)

      // If dbFaults are loaded...
      if (dbFaults) {
        const dbFault = dbFaults.find(f => f.id === initialFaultId)
        if (dbFault) {
          setSelectedDeviceId(dbFault.deviceId)
          return
        }
      }

      // If simulated/device generated fault
      const device = devices.find(d => d.id === initialFaultId)
      if (device) {
        setSelectedDeviceId(device.id)
      }
    }
  }, [initialFaultId, dbFaults, devices])

  // Generate faults from devices (auto-generated from device status)
  const deviceGeneratedFaults = useMemo<Fault[]>(() => {
    const faultList: Fault[] = []
    const categoryMap: Record<string, FaultCategory> = {
      'device-fault-grocery-001': 'environmental-ingress',
      'device-fault-electronics-001': 'electrical-driver',
      'device-fault-apparel-001': 'thermal-overheat',
      'device-fault-home-001': 'installation-wiring',
      'device-fault-electronics-002': 'control-integration',
      'device-fault-toys-001': 'manufacturing-defect',
      'device-fault-apparel-002': 'mechanical-structural',
      'device-fault-grocery-002': 'optical-output',
    }

    const detectedTimes: Record<string, number> = {
      'device-fault-grocery-001': 45, // 45 minutes ago
      'device-fault-electronics-001': 2 * 60, // 2 hours ago
      'device-fault-apparel-001': 4 * 60, // 4 hours ago
      'device-fault-home-001': 6 * 60, // 6 hours ago
      'device-fault-electronics-002': 8 * 60, // 8 hours ago
      'device-fault-toys-001': 12 * 60, // 12 hours ago
      'device-fault-apparel-002': 18 * 60, // 18 hours ago
      'device-fault-grocery-002': 24 * 60, // 24 hours ago
    }

    devices.forEach(device => {
      // Check if this is a specific fault device with assigned category
      const assignedCategory = categoryMap[device.id]

      if (assignedCategory) {
        // Use specific fault descriptions for these devices
        const descriptions: Record<string, string> = {
          'device-fault-grocery-001': 'Water intrusion detected in fixture housing. Device FLX-3158 shows signs of moisture damage. Inspect seals and gaskets. This is a repeat failure pattern in this location.',
          'device-fault-electronics-001': 'Legacy 6043 driver burnout - no power output. Device FLX-2041 requires driver replacement. Check warranty status. Driver not responding to power-on sequence.',
          'device-fault-apparel-001': 'Input cable melting detected due to excessive current. Device FLX-2125 shows thermal stress. Review power distribution. Thermal protection activated.',
          'device-fault-home-001': 'Power landed on dim line instead of power line. Device FLX-2063 miswired during installation. Verify wiring diagram. Installation error causing device malfunction.',
          'device-fault-electronics-002': 'GRX-TVI trim level issues causing incorrect dimming. Device FLX-2088 not responding to control signals. Check control module. Control signal not recognized by device.',
          'device-fault-toys-001': 'Loose internal parts causing intermittent connection. Device FLX-2078 shows manufacturing defect. Document and contact manufacturer. Defect present from initial installation.',
          'device-fault-apparel-002': 'Bezel detaching from fixture housing. Device FLX-2092 has structural mounting issue. Inspect bracket geometry. Hardware issue preventing proper operation.',
          'device-fault-grocery-002': 'Single LED out in fixture array. Device FLX-2105 shows optical output abnormality. Check LED module connections. Visible output abnormality detected.',
        }

        faultList.push({
          device,
          faultType: assignedCategory,
          detectedAt: new Date(Date.now() - 1000 * 60 * (detectedTimes[device.id] || 60)),
          description: descriptions[device.id] || generateFaultDescription(assignedCategory, device.deviceId),
        })
      }
      // Missing devices - assign realistic fault category
      else if (device.status === 'missing') {
        const faultCategory = assignFaultCategory(device)
        faultList.push({
          device,
          faultType: faultCategory,
          detectedAt: new Date(Date.now() - 1000 * 60 * 60 * (Math.floor(Math.random() * 24) + 1)),
          description: generateFaultDescription(faultCategory, device.deviceId),
        })
      }
      // Offline devices - assign realistic fault category
      else if (device.status === 'offline') {
        const faultCategory = assignFaultCategory(device)
        faultList.push({
          device,
          faultType: faultCategory,
          detectedAt: new Date(Date.now() - 1000 * 60 * 60 * (Math.floor(Math.random() * 48) + 1)),
          description: generateFaultDescription(faultCategory, device.deviceId),
        })
      }
      // Low battery devices - still track separately but can also have other issues
      if (device.battery !== undefined && device.battery < 20 && !assignedCategory) {
        // Low battery can be a symptom, but also create a separate entry
        const faultCategory = device.status === 'offline' || device.status === 'missing'
          ? assignFaultCategory(device)
          : 'electrical-driver' // Low battery often indicates power issues
        faultList.push({
          device,
          faultType: faultCategory,
          detectedAt: new Date(Date.now() - 1000 * 60 * (Math.floor(Math.random() * 120) + 30)),
          description: device.battery < 10
            ? `Critical battery level (${device.battery}%). Device may shut down. Power supply or charging system issue suspected.`
            : `Battery level is below 20% (${device.battery}%). Replacement recommended. May indicate charging system or power supply problem.`,
        })
      }

      // Low signal - generate fault entry
      if (device.signal !== undefined && device.signal < 20 && !assignedCategory && device.status === 'online') {
        faultList.push({
          device,
          faultType: 'control-integration',
          detectedAt: new Date(Date.now() - 1000 * 60 * (Math.floor(Math.random() * 60) + 10)),
          description: `Weak signal detected (${device.signal}%). Check wireless coverage or interference.`,
        })
      }
    })


    // Sort by detected time (most recent first)
    return faultList.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
  }, [devices])

  // Combine device-generated faults and database faults
  const faults = useMemo<Fault[]>(() => {
    // Start with device-generated faults
    const allFaults: Fault[] = [...deviceGeneratedFaults]

    // Add database faults
    if (dbFaults) {
      dbFaults.forEach(dbFault => {
        // Find the device
        const device = devices.find(d => d.id === dbFault.deviceId)
        if (device) {
          allFaults.push({
            id: dbFault.id, // Include database fault ID
            device,
            faultType: dbFault.faultType as FaultCategory,
            detectedAt: dbFault.detectedAt,
            description: dbFault.description,
            resolved: dbFault.resolved, // Include resolved status
          })
        }
      })
    }

    // Sort by detected time (most recent first)
    const sorted = allFaults.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())

    // Filter out dismissed faults
    return sorted.filter(f => {
      // For DB faults, they are removed via mutation refetch, but we can also filter if needed
      if (f.id) return true

      // For discovered faults, check if dismissed
      const faultKey = `${f.device.id}-${f.faultType}-${f.detectedAt.getTime()}`
      return !dismissedFaultKeys.has(faultKey)
    })
  }, [dbFaults, devices, deviceGeneratedFaults, dismissedFaultKeys])

  // Sync database faults to notifications
  // Use a ref to track which faults we've already created notifications for
  // Store as a global map keyed by fault ID to persist across site changes
  const syncedFaultIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!dbFaults || !activeSiteId || devices.length === 0) return

    // Create notifications for database faults that don't have notifications yet
    dbFaults.forEach(dbFault => {
      const notificationId = `fault-notification-${dbFault.id}`

      // Skip if we've already synced this fault (globally, not per-site)
      if (syncedFaultIdsRef.current.has(dbFault.id)) return

      // Check if notification already exists in the notifications list
      // This prevents duplicates if the component re-renders
      const existingNotification = notifications.find(n => n.id === notificationId)
      if (existingNotification) {
        // Notification already exists, mark fault as synced
        syncedFaultIdsRef.current.add(dbFault.id)
        return
      }

      const device = devices.find(d => d.id === dbFault.deviceId)
      if (device) {
        const categoryInfo = faultCategories[dbFault.faultType as FaultCategory]
        if (categoryInfo) {
          addNotification({
            id: notificationId,
            type: 'fault',
            title: `${categoryInfo.label} Detected`,
            message: dbFault.description || `${categoryInfo.label} detected on device ${device.deviceId}. ${categoryInfo.description.split('.')[0]}.`,
            timestamp: new Date(dbFault.detectedAt),
            read: false,
            link: '/faults',
            siteId: activeSiteId,
          })
          // Mark this fault as synced immediately to prevent duplicates
          syncedFaultIdsRef.current.add(dbFault.id)
        }
      }
    })
  }, [dbFaults, activeSiteId, devices, addNotification, notifications])

  // Initialize category filters - will be updated based on actual faults
  const [showCategories, setShowCategories] = useState<Record<FaultCategory, boolean>>({
    'environmental-ingress': false,
    'electrical-driver': false,
    'thermal-overheat': false,
    'installation-wiring': false,
    'control-integration': false,
    'manufacturing-defect': false,
    'mechanical-structural': false,
    'optical-output': false,
  })

  // Update category filters when faults change - enable only categories that have faults
  useEffect(() => {
    const categoriesWithFaults = new Set(faults.map(f => f.faultType))
    setShowCategories(prev => {
      const updated: Record<FaultCategory, boolean> = {
        'environmental-ingress': categoriesWithFaults.has('environmental-ingress'),
        'electrical-driver': categoriesWithFaults.has('electrical-driver'),
        'thermal-overheat': categoriesWithFaults.has('thermal-overheat'),
        'installation-wiring': categoriesWithFaults.has('installation-wiring'),
        'control-integration': categoriesWithFaults.has('control-integration'),
        'manufacturing-defect': categoriesWithFaults.has('manufacturing-defect'),
        'mechanical-structural': categoriesWithFaults.has('mechanical-structural'),
        'optical-output': categoriesWithFaults.has('optical-output'),
      }
      return updated
    })
  }, [faults])
  const listContainerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<ResizablePanelRef>(null)

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

  const handleAddNewFault = async (faultData: { device: Device; faultType: FaultCategory; description: string }) => {
    try {
      // Save to database
      const newFault = await createFaultMutation.mutateAsync({
        deviceId: faultData.device.id,
        faultType: faultData.faultType,
        description: faultData.description,
        detectedAt: new Date(),
      })

      // Create notification for the new fault
      const categoryInfo = faultCategories[faultData.faultType]
      addNotification({
        id: `fault-notification-${newFault.id}`,
        type: 'fault',
        title: `${categoryInfo.label} Detected`,
        message: faultData.description || `${categoryInfo.label} detected on device ${faultData.device.deviceId}. ${categoryInfo.description.split('.')[0]}.`,
        timestamp: new Date(newFault.detectedAt),
        read: false,
        link: '/faults',
        siteId: activeSiteId || undefined,
      })

      // Select the newly created fault by its ID
      setSelectedFaultId(newFault.id)
      setSelectedDeviceId(faultData.device.id)
    } catch (error) {
      console.error('Failed to create fault:', error)
      addToast({
        type: 'error',
        title: 'Creation Failed',
        message: 'Failed to create fault. Please try again.'
      })
    }
  }

  // Check if we should highlight a specific device (from dashboard navigation)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const highlightDevice = sessionStorage.getItem('highlightDevice')
      if (highlightDevice) {
        // Find the device by deviceId
        const device = devices.find(d => d.deviceId === highlightDevice)
        if (device) {
          setSelectedFaultId(device.id)
          setSelectedDeviceId(device.id)
          // Clear the highlight after selecting
          sessionStorage.removeItem('highlightDevice')
        }
      }
    }
  }, [devices])

  // Handle device selection from map
  const handleDeviceSelect = (deviceId: string | null) => {
    setSelectedDeviceId(deviceId)
    if (deviceId) {
      setSelectedFaultId(deviceId)
    }
  }


  // Open panel when fault is selected on tablet/mobile
  useEffect(() => {
    if (selectedFaultId && panelRef.current && typeof window !== 'undefined' && window.innerWidth < 1024) {
      // Open panel when fault is selected on tablet/mobile
      if (panelRef.current.isCollapsed) {
        panelRef.current.open()
      }
    }
  }, [selectedFaultId])

  const selectedFault = useMemo(() => {
    if (!selectedFaultId) return null

    // First, try to find by database fault ID
    const dbFault = dbFaults?.find(f => f.id === selectedFaultId)
    if (dbFault) {
      const device = devices.find(d => d.id === dbFault.deviceId)
      if (device) {
        return {
          id: dbFault.id, // Include database fault ID
          device,
          faultType: dbFault.faultType as FaultCategory,
          detectedAt: dbFault.detectedAt,
          description: dbFault.description,
          resolved: dbFault.resolved, // Include resolved status
        }
      }
    }

    // For device-generated faults, match by composite key: deviceId-faultType-timestamp
    return faults.find(f => {
      const faultId = f.id || `${f.device.id}-${f.faultType}-${f.detectedAt.getTime()}`
      return faultId === selectedFaultId
    }) || null
  }, [faults, selectedFaultId, dbFaults, devices])

  // Filter faults based on selected device, search, and category filters
  const filteredFaults = useMemo(() => {
    let filtered = faults

    // Apply category filters
    filtered = filtered.filter(fault => {
      return showCategories[fault.faultType] !== false
    })

    // Apply search filter - fuzzy match on all fields
    if (searchQuery.trim()) {
      const query = searchQuery.trim()
      // Use fuzzy search for better matching
      const searchableFaults = filtered.map(fault => ({
        id: fault.device.id,
        deviceId: fault.device.deviceId,
        serialNumber: fault.device.serialNumber,
        location: fault.device.location,
        zone: fault.device.zone,
        type: fault.device.type,
        status: fault.device.status,
        faultType: fault.faultType,
        description: fault.description,
        fault, // Keep reference to original fault
      }))
      const results = fuzzySearch(
        query,
        searchableFaults,
        ['deviceId', 'serialNumber', 'location', 'zone', 'type', 'status', 'faultType', 'description'],
        20 // min score threshold
      )
      filtered = results.map(r => r.item.fault)
    }

    // Note: We don't filter by selectedDeviceId or selectedFaultId here
    // because we want to show the entire fault list even when one is selected.
    // The selected fault will be highlighted in the UI, but all faults remain visible.

    return filtered
  }, [faults, searchQuery, showCategories])

  // Prepare zones for map
  const mapZones = useMemo(() => {
    return zones.map(z => ({
      id: z.id,
      name: z.name,
      color: z.color,
      polygon: z.polygon,
    }))
  }, [zones])

  // Prepare devices for map with fault indicators
  const mapDevices = useMemo(() => {
    return devices.map(d => {
      const deviceFaults = faults.filter(f => f.device.id === d.id)

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
        hasFault: deviceFaults.length > 0,
        faultCount: deviceFaults.length,
        faultType: deviceFaults[0]?.faultType,
      }
    })
  }, [devices, faults])

  // Calculate fault insights with deltas and trends
  const insights = useMemo(() => {
    const now = Date.now()
    const last24h = now - (24 * 60 * 60 * 1000)
    const last48h = now - (48 * 60 * 60 * 1000)

    // Insight 1: New Faults (Last 24h)
    const newFaults24h = faults.filter(f => f.detectedAt.getTime() >= last24h)
    const newFaultsPrevious24h = faults.filter(f => {
      const time = f.detectedAt.getTime()
      return time >= last48h && time < last24h
    })
    const newFaultsDelta = newFaults24h.length - newFaultsPrevious24h.length
    const newFaultsTrend: 'up' | 'down' | 'stable' = newFaultsDelta > 0 ? 'up' : newFaultsDelta < 0 ? 'down' : 'stable'

    // Insight 2: Trending Category (category with most new faults in last 24h)
    const categoryNewCounts: Record<FaultCategory, number> = {
      'environmental-ingress': 0,
      'electrical-driver': 0,
      'thermal-overheat': 0,
      'installation-wiring': 0,
      'control-integration': 0,
      'manufacturing-defect': 0,
      'mechanical-structural': 0,
      'optical-output': 0,
    }

    newFaults24h.forEach(fault => {
      categoryNewCounts[fault.faultType] = (categoryNewCounts[fault.faultType] || 0) + 1
    })

    const trendingCategory = Object.entries(categoryNewCounts)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)[0]

    const trendingCategoryInfo = trendingCategory
      ? {
        category: trendingCategory[0] as FaultCategory,
        newCount: trendingCategory[1],
        totalCount: faults.filter(f => f.faultType === trendingCategory[0]).length,
      }
      : null

    // Insight 3: Critical Faults (faults older than 6 hours that are still active)
    const criticalThreshold = now - (6 * 60 * 60 * 1000) // 6 hours
    const criticalFaults = faults.filter(f => f.detectedAt.getTime() < criticalThreshold)
    const criticalCount = criticalFaults.length

    // Calculate critical delta (compare to 12 hours ago)
    const criticalThreshold12h = now - (12 * 60 * 60 * 1000)
    const criticalFaultsPrevious = faults.filter(f => {
      const time = f.detectedAt.getTime()
      return time >= criticalThreshold12h && time < criticalThreshold
    })
    const criticalDelta = criticalCount - criticalFaultsPrevious.length

    // Insight 4: Average Resolution Time (mock - simulate based on fault age distribution)
    const recentFaults = faults.filter(f => f.detectedAt.getTime() >= last24h)
    const olderFaults = faults.filter(f => f.detectedAt.getTime() < last24h)
    const avgAge = olderFaults.length > 0
      ? olderFaults.reduce((sum, f) => sum + (now - f.detectedAt.getTime()), 0) / olderFaults.length
      : 0
    const avgAgeHours = Math.floor(avgAge / (1000 * 60 * 60))

    return {
      newFaults24h: {
        count: newFaults24h.length,
        delta: newFaultsDelta,
        trend: newFaultsTrend,
        label: 'New Faults (24h)',
        description: `${newFaults24h.length} detected in last 24 hours`,
      },
      trendingCategory: trendingCategoryInfo ? {
        category: trendingCategoryInfo.category,
        newCount: trendingCategoryInfo.newCount,
        totalCount: trendingCategoryInfo.totalCount,
        label: 'Trending Up',
        description: (
          <div className="flex items-center gap-1.5">
            {faultCategories[trendingCategoryInfo.category].shortLabel}
            <Badge variant="outline" className="text-[10px] h-4 px-1 py-0">+{trendingCategoryInfo.newCount}</Badge>
          </div>
        ),
      } : null,
      criticalFaults: {
        count: criticalCount,
        delta: criticalDelta,
        trend: (criticalDelta > 0 ? 'up' : criticalDelta < 0 ? 'down' : 'stable') as 'up' | 'down' | 'stable',
        label: 'Critical Priority',
        description: `${criticalCount} faults older than 6 hours`,
      },
      avgResolutionTime: {
        hours: avgAgeHours,
        label: 'Avg. Age',
        description: olderFaults.length > 0 ? `${avgAgeHours}h average age` : 'All faults recent',
      },
    }
  }, [faults])

  // Handle clicking outside the list and panel to deselect
  const handleMainContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // Deselect if clicking outside both the list container and panel
    if (
      listContainerRef.current &&
      panelRef.current?.panelElement?.current &&
      !listContainerRef.current.contains(target) &&
      !panelRef.current.panelElement.current.contains(target)
    ) {
      setSelectedFaultId(null)
      setSelectedDeviceId(null)
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Top Search Island - In flow */}
      <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3">
        <SearchIsland
          position="top"
          fullWidth={true}
          title="Faults / Health"
          subtitle="Monitor device health and system status"
          placeholder="Search faults or devices..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          metrics={faults.length > 0 ? [
            {
              label: insights.newFaults24h.label,
              value: insights.newFaults24h.count,
              color: 'var(--color-text)',
              trend: insights.newFaults24h.trend,
              delta: insights.newFaults24h.delta,
              icon: <Clock size={14} className="text-[var(--color-primary)]" />,
            },
            ...(insights.trendingCategory ? [{
              label: insights.trendingCategory.label,
              value: faultCategories[insights.trendingCategory.category].shortLabel,
              color: 'var(--color-warning)',
              trend: 'up' as const,
              delta: insights.trendingCategory.newCount,
              icon: <TrendingUp size={14} className="text-[var(--color-warning)]" />,
            }] : []),
            {
              label: insights.criticalFaults.label,
              value: insights.criticalFaults.count,
              color: 'var(--color-danger)',
              trend: insights.criticalFaults.trend,
              delta: insights.criticalFaults.delta,
              icon: <AlertTriangle size={14} className="text-[var(--color-danger)]" />,
            },
            {
              label: insights.avgResolutionTime.label,
              value: `${insights.avgResolutionTime.hours}h`,
              color: 'var(--color-text)',
              icon: <TrendingDown size={14} className="text-[var(--color-primary)]" />,
            },
          ] : []}
        />
      </div>

      {/* Main Content: Fault List/Map + Details Panel */}
      <div
        className="main-content-area flex-1 flex min-h-0 gap-2 md:gap-4 page-padding-x pt-2 overflow-hidden"
        onClick={handleMainContentClick}
      >
        {/* Fault List/Map - Left Side */}
        <div
          ref={listContainerRef}
          className="flex-1 min-w-0 flex flex-col overflow-y-auto"
        >
          {/* View Toggle and Category Filters */}
          <div className="mb-3 flex items-center justify-between gap-3">
            {/* Left side: View Toggle */}
            <MapViewToggle currentView={viewMode} onViewChange={setViewMode} />

            {/* Right side: Category Filter Toggles */}
            <div className="flex items-center gap-3">
              {/* Show Resolved Toggle */}
              <Button
                variant={showResolved ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setShowResolved(prev => !prev)}
                className={`text-sm px-3 py-1.5 h-auto transition-all ${showResolved
                  ? 'bg-[var(--color-primary-soft)] border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'bg-transparent border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
                  }`}
              >
                {showResolved ? 'Hide Resolved' : 'Show Resolved'}
              </Button>

              {selectedDeviceId && viewMode === 'map' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedDeviceId(null)
                    setSelectedFaultId(null)
                  }}
                  className="text-sm h-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  Clear filter
                </Button>
              )}

              {/* Category Filter Toggles - only show in list view */}
              {viewMode === 'list' && (
                <div className="flex items-center gap-1 p-0.5 bg-[var(--color-surface-subtle)] rounded-lg border border-[var(--color-border-subtle)]">
                  {(Object.keys(faultCategories) as FaultCategory[]).map((category) => {
                    const categoryInfo = faultCategories[category]
                    const isActive = showCategories[category]
                    const hasFaults = faults.some(f => f.faultType === category)
                    const isDisabled = !hasFaults

                    // Get icon component
                    const getIcon = () => {
                      switch (category) {
                        case 'environmental-ingress': return <Droplets size={14} />
                        case 'electrical-driver': return <Zap size={14} />
                        case 'thermal-overheat': return <Thermometer size={14} />
                        case 'installation-wiring': return <Plug size={14} />
                        case 'control-integration': return <Settings size={14} />
                        case 'manufacturing-defect': return <Package size={14} />
                        case 'mechanical-structural': return <Wrench size={14} />
                        case 'optical-output': return <Lightbulb size={14} />
                        default: return null
                      }
                    }

                    return (
                      <Toggle
                        key={category}
                        pressed={isActive}
                        onPressedChange={(pressed) => {
                          if (!isDisabled) {
                            setShowCategories(prev => ({ ...prev, [category]: pressed }))
                          }
                        }}
                        size="icon"
                        disabled={isDisabled}
                        title={isDisabled ? `${categoryInfo.shortLabel} (no faults)` : categoryInfo.shortLabel}
                      >
                        {getIcon()}
                      </Toggle>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-h-0">
            {viewMode === 'list' ? (
              <div className="fusion-card h-full flex flex-col">
                <FaultList
                  faults={filteredFaults}
                  selectedFaultId={selectedFaultId}
                  onFaultSelect={(faultId) => {
                    setSelectedFaultId(faultId)
                    // Also set device ID for map filtering
                    if (faultId) {
                      // Find the fault by matching the composite key
                      const fault = faults.find(f => {
                        // Check if it's a database fault ID
                        if (f.id === faultId) return true
                        // Match by composite key
                        const compositeId = `${f.device.id}-${f.faultType}-${f.detectedAt.getTime()}`
                        return compositeId === faultId
                      })
                      if (fault) {
                        setSelectedDeviceId(fault.device.id)
                      }
                    } else {
                      setSelectedDeviceId(null)
                    }
                  }}
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
                    <FaultsMapCanvas
                      zones={mapZones}
                      devices={mapDevices}
                      faults={faults}
                      mapImageUrl={mapImageUrl}
                      vectorData={vectorData}
                      selectedDeviceId={selectedDeviceId}
                      onDeviceSelect={handleDeviceSelect}
                      devicesData={devices}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Fault Details Panel - Right Side */}
        <ResizablePanel
          ref={panelRef}
          defaultWidth={384}
          minWidth={320}
          maxWidth={512}
          collapseThreshold={200}
          storageKey="faults_panel"
        >
          <FaultDetailsPanel
            fault={selectedFault}
            devices={devices}
            onAddNewFault={handleAddNewFault}
            onDelete={(faultId) => {
              if (!selectedFault) return

              // If it's a database fault (has ID and matches selected)
              if (selectedFault.id && selectedFault.id === faultId) {
                deleteFaultMutation.mutate({ id: faultId })
              }
              // If it's a discovered fault (no ID or passed 'discovered' flag)
              else {
                // Generate the key to dismiss
                const faultKey = selectedFault.id || `${selectedFault.device.id}-${selectedFault.faultType}-${selectedFault.detectedAt.getTime()}`

                // Add to dismissed set
                setDismissedFaultKeys(prev => {
                  const next = new Set(prev)
                  next.add(faultKey)
                  return next
                })

                // Clear selection
                setSelectedFaultId(null)
                setSelectedDeviceId(null)
              }
            }}
            onResolve={(faultId) => updateFaultMutation.mutate({ id: faultId, resolved: true })}
            onUnresolve={(faultId) => updateFaultMutation.mutate({ id: faultId, resolved: false })}
          />
        </ResizablePanel>
      </div>
    </div>
  )
}
