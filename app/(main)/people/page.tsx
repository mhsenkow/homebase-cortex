'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { SearchIsland } from '@/components/layout/SearchIsland'
import { ResizablePanel } from '@/components/layout/ResizablePanel'
import { PeopleListView } from '@/components/people/PeopleListView'
import { PeoplePanel } from '@/components/people/PeoplePanel'
import { PeopleViewToggle, type PeopleViewMode } from '@/components/people/PeopleViewToggle'
import { PeoplePalette } from '@/components/people/PeoplePalette'
import { PeopleToolbar, type PeopleToolMode } from '@/components/people/PeopleToolbar'
import { usePeople } from '@/lib/hooks/usePeople'
import { useSite } from '@/lib/SiteContext'
import { useToast } from '@/lib/ToastContext'
import { trpc } from '@/lib/trpc/client'
import dynamic from 'next/dynamic'

// Dynamically import PeopleMapCanvas to avoid SSR issues
const PeopleMapCanvasDynamic = dynamic(() => import('@/components/people/PeopleMapCanvas').then(mod => ({ default: mod.PeopleMapCanvas })), {
    ssr: false,
    loading: () => (
        <div className="h-full flex items-center justify-center">
            <div className="text-[var(--color-text-muted)]">Loading map...</div>
        </div>
    ),
})

export default function PeoplePage() {
    const searchParams = useSearchParams()
    const { people, isLoading: peopleLoading, addPerson, updatePerson, updatePersonPosition, deletePerson } = usePeople()
    const { activeSiteId } = useSite()
    const { addToast } = useToast()

    const [viewMode, setViewMode] = useState<PeopleViewMode>('grid')
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
    const appliedPersonIdFromUrlRef = useRef<string | null>(null)

    // Apply personId from URL after people have loaded (avoids race where param is set before data)
    useEffect(() => {
        const personIdFromQuery = searchParams.get('personId')
        if (!personIdFromQuery) {
            appliedPersonIdFromUrlRef.current = null
            return
        }
        if (peopleLoading) return
        if (appliedPersonIdFromUrlRef.current === personIdFromQuery) return
        if (people.some(p => p.id === personIdFromQuery)) {
            setSelectedPersonId(personIdFromQuery)
            appliedPersonIdFromUrlRef.current = personIdFromQuery
        }
    }, [searchParams, people, peopleLoading])
    const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [roleFilter, setRoleFilter] = useState<string>('all')
    const [toolMode, setToolMode] = useState<PeopleToolMode>('select')
    const [currentLocationId, setCurrentLocationId] = useState<string | null>(null)
    const [mapImageUrl, setMapImageUrl] = useState<string | null>(null)
    const [vectorData, setVectorData] = useState<any>(null)
    const [imageBounds, setImageBounds] = useState<any>(null)
    const [mapScale, setMapScale] = useState(1)
    const [mapPosition, setMapPosition] = useState({ x: 0, y: 0 })
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    // Fetch locations
    const utils = trpc.useContext()
    const { data: locations = [] } = trpc.location.list.useQuery(
        { siteId: activeSiteId || '' },
        { enabled: !!activeSiteId }
    )

    const currentLocation = useMemo(() => {
        if (locations.length > 0 && !currentLocationId) {
            return locations[0]
        }
        return locations.find((loc: any) => loc.id === currentLocationId) || null
    }, [locations, currentLocationId])

    // Auto-select first location
    useEffect(() => {
        if (locations.length > 0 && !currentLocationId) {
            const defaultLocation = locations.find((l: any) => l.type === 'base') || locations[0]
            setCurrentLocationId(defaultLocation.id)
        }
    }, [locations, currentLocationId])

    // Load location data
    useEffect(() => {
        const loadLocationData = async () => {
            if (!currentLocation) {
                setMapImageUrl(null)
                setVectorData(null)
                return
            }

            if (currentLocation.vectorDataUrl) {
                try {
                    const res = await fetch(currentLocation.vectorDataUrl)
                    if (res.ok) {
                        const data = await res.json()
                        setVectorData(data)
                    }
                } catch (e) {
                    addToast({ type: 'error', title: 'Map data', message: 'Failed to load vector data.' })
                }
            } else {
                setVectorData(null)
            }

            if (currentLocation.imageUrl) {
                setMapImageUrl(currentLocation.imageUrl)
            } else {
                setMapImageUrl(null)
            }
        }
        loadLocationData()
    }, [currentLocation])

    const mapUploaded = !!currentLocation

    // Sync mutation for role groups
    const syncRoleGroupsMutation = trpc.person.syncAllToRoleGroups.useMutation()
    const syncedSitesRef = useRef<Set<string>>(new Set())

    // Sync role groups (one-time per site); groups auto-loaded by useGroupSync
    useEffect(() => {
        if (activeSiteId && !syncedSitesRef.current.has(activeSiteId) && !syncRoleGroupsMutation.isPending) {
            syncedSitesRef.current.add(activeSiteId)
            syncRoleGroupsMutation.mutate(
                { siteId: activeSiteId },
                { onError: (err) => addToast({ type: 'warning', title: 'Role group sync', message: (err as unknown as Error)?.message ?? 'Sync skipped.' }) }
            )
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSiteId])

    const handleMainContentClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement
        if (
            mapContainerRef.current &&
            panelRef.current &&
            !mapContainerRef.current.contains(target) &&
            !panelRef.current.contains(target)
        ) {
            setSelectedPersonId(null)
        }
    }

    const handleCreatePerson = async () => {
        if (!activeSiteId) {
            addToast({ type: 'error', title: 'Error', message: 'No site selected' })
            return
        }

        try {
            const newPerson = await addPerson({
                firstName: 'New',
                lastName: 'Person',
                email: '',
                role: 'User',
                siteId: activeSiteId,
            })
            setSelectedPersonId(newPerson.id)
            addToast({ type: 'success', title: 'Person Created', message: 'New person created successfully' })
        } catch (error) {
            addToast({ type: 'error', title: 'Error', message: (error as Error)?.message ?? 'Failed to create person' })
        }
    }

    const handleDeletePerson = async (personId: string) => {
        try {
            await deletePerson(personId)
            if (selectedPersonId === personId) {
                setSelectedPersonId(null)
            }
            addToast({ type: 'success', title: 'Person Deleted', message: 'Person deleted successfully' })
        } catch (error) {
            addToast({ type: 'error', title: 'Error', message: (error as Error)?.message ?? 'Failed to delete person' })
        }
    }

    const handleDeletePeople = async (personIds: string[]) => {
        try {
            await Promise.all(personIds.map(id => deletePerson(id)))
            if (selectedPersonId && personIds.includes(selectedPersonId)) {
                setSelectedPersonId(null)
            }
            setSelectedPersonIds([])
            addToast({ type: 'success', title: 'People Deleted', message: `${personIds.length} people deleted successfully` })
        } catch (error) {
            addToast({ type: 'error', title: 'Error', message: (error as Error)?.message ?? 'Failed to delete people' })
        }
    }

    // Handle person move on map (debounced position update)
    const handlePersonMove = useCallback((personId: string, x: number, y: number) => {
        const person = people.find(p => p.id === personId)
        if (!person) return
        updatePersonPosition(personId, x, y)
    }, [people, updatePersonPosition])

    const handlePersonMoveEnd = useCallback((personId: string, x: number, y: number) => {
        handlePersonMove(personId, x, y)
    }, [handlePersonMove])

    // Handle palette drag (now handled directly in PeoplePalette)
    const handlePaletteDragStart = useCallback((e: React.DragEvent, personIds: string[]) => {
        // This is just a placeholder - actual drag handling is in PeoplePalette
    }, [])

    // Handle map drop
    const handleMapDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()

        try {
            // Get dragged person IDs (using application/json like DevicePalette)
            const json = e.dataTransfer.getData('application/json')
            if (!json) {
                addToast({ type: 'warning', title: 'Drop', message: 'No drag data found' })
                return
            }

            const personIds = JSON.parse(json) as string[]
            if (!Array.isArray(personIds) || personIds.length === 0) {
                addToast({ type: 'warning', title: 'Drop', message: 'Invalid person data' })
                return
            }

            // Calculate drop coordinates
            // The event gives clientX/Y. We need to convert to map coordinates (normalized 0-1).
            const mapContainer = e.currentTarget.getBoundingClientRect()
            const dropX = e.clientX - mapContainer.left
            const dropY = e.clientY - mapContainer.top

            // Convert to Stage coordinates: (Mouse - StagePos) / Scale
            // Account for stage position and scale
            const stageX = (dropX - (mapPosition.x || 0)) / (mapScale || 1)
            const stageY = (dropY - (mapPosition.y || 0)) / (mapScale || 1)

            let finalX = 0
            let finalY = 0

            if (imageBounds && imageBounds.width > 0 && imageBounds.height > 0) {
                // Use effective image bounds for coordinate conversion
                // normalizedX = (canvasX - imageX) / imageWidth
                finalX = (stageX - imageBounds.x) / imageBounds.width
                finalY = (stageY - imageBounds.y) / imageBounds.height
            } else {
                // Fallback: use container dimensions
                finalX = stageX / mapContainer.width
                finalY = stageY / mapContainer.height
            }

            // Clamp 0-1
            finalX = Math.max(0.01, Math.min(0.99, finalX))
            finalY = Math.max(0.01, Math.min(0.99, finalY))

            // Persist each person's position immediately (batch drop; debounce is for drag only)
            const offset = 0.02
            for (let i = 0; i < personIds.length; i++) {
                const personId = personIds[i]
                const person = people.find(p => p.id === personId)
                if (person) {
                    const offsetX = i * offset
                    const offsetY = 0
                    try {
                        await updatePerson({ id: personId, x: finalX + offsetX, y: finalY + offsetY })
                    } catch (e) {
                        addToast({ type: 'error', title: 'Drop', message: (e as Error)?.message ?? 'Failed to save position' })
                    }
                } else {
                    addToast({ type: 'warning', title: 'Drop', message: `Person ${personId} not found` })
                }
            }

            if (personIds.length > 0) {
                const firstPerson = people.find(p => p.id === personIds[0])
                if (firstPerson) {
                    const personText = personIds.length > 1 ? 'people' : 'person'
                    const count = personIds.length
                    const message = count + ' ' + personText + ' placed on map'
                    addToast({
                        type: 'success',
                        title: 'People Placed',
                        message: message
                    })
                }
            }
        } catch (error) {
            addToast({
                type: 'error',
                title: 'Drop Failed',
                message: (error as Error)?.message ?? 'Failed to place person on map'
            })
        }
    }, [people, updatePerson, mapPosition, mapScale, imageBounds, addToast])

    // Get unique roles for filter dropdown
    const availableRoles = useMemo(() => {
        const roles = new Set<string>()
        people.forEach(p => {
            if (p.role) roles.add(p.role)
        })
        return Array.from(roles).sort()
    }, [people])

    // Filter people by search and role
    const filteredPeople = useMemo(() => {
        let result = people

        // Apply role filter
        if (roleFilter !== 'all') {
            result = result.filter(p => p.role === roleFilter)
        }

        // Apply search filter
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase()
            result = result.filter((p) => {
                const firstNameMatch = p.firstName.toLowerCase().includes(lowerQuery)
                const lastNameMatch = p.lastName.toLowerCase().includes(lowerQuery)
                const emailMatch = p.email?.toLowerCase().includes(lowerQuery) || false
                const roleMatch = p.role?.toLowerCase().includes(lowerQuery) || false
                return firstNameMatch || lastNameMatch || emailMatch || roleMatch
            })
        }

        return result
    }, [people, searchQuery, roleFilter])

    return (
        <div className="h-full flex flex-col min-h-0 overflow-hidden">
            {/* Top Search Island */}
            <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3 relative">
                <SearchIsland
                    position="top"
                    fullWidth={true}
                    showActions={true}
                    title="People"
                    subtitle="Manage users and personnel"
                    placeholder="Search people..."
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    onActionDetected={(action) => {
                        if (action.id === 'create-person') {
                            handleCreatePerson()
                        }
                    }}
                />
            </div>

            {/* Filters and View Toggle */}
            <div className="flex-shrink-0 page-padding-x pb-2 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <PeopleViewToggle currentView={viewMode} onViewChange={setViewMode} />
                    {availableRoles.length > 0 && (
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="px-3 py-1.5 rounded-lg text-sm bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] cursor-pointer"
                        >
                            <option value="all">All Roles</option>
                            {availableRoles.map(role => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                    )}
                    {(searchQuery || roleFilter !== 'all') && (
                        <span className="text-xs text-[var(--color-text-muted)]">
                            {filteredPeople.length} of {people.length} people
                        </span>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div
                className="main-content-area flex-1 flex min-h-0 gap-2 md:gap-4 page-padding-x"
                style={{ overflow: 'visible' }}
                onClick={handleMainContentClick}
            >
                {viewMode === 'grid' ? (
                    <>
                        {/* Grid View - Left Side */}
                        <div
                            ref={mapContainerRef}
                            className="flex-1 min-w-0 flex flex-col"
                        >
                            {/* Content Area */}
                            <div className="flex-1 min-h-0 relative rounded-2xl shadow-[var(--shadow-strong)] border border-[var(--color-border-subtle)] overflow-hidden bg-[var(--color-surface)]">
                                <PeopleListView
                                    people={filteredPeople}
                                    selectedPersonId={selectedPersonId}
                                    onPersonSelect={setSelectedPersonId}
                                    searchQuery={searchQuery}
                                    onCreatePerson={handleCreatePerson}
                                    onDeletePeople={handleDeletePeople}
                                />
                            </div>
                        </div>

                        {/* People Panel - Right Side */}
                        <div ref={panelRef}>
                            <ResizablePanel
                                defaultWidth={384}
                                minWidth={320}
                                maxWidth={512}
                                collapseThreshold={200}
                                storageKey="people_panel"
                            >
                                <PeoplePanel
                                    people={people}
                                    selectedPersonId={selectedPersonId}
                                    onPersonSelect={setSelectedPersonId}
                                    onCreatePerson={handleCreatePerson}
                                    onDeletePerson={handleDeletePerson}
                                    onDeletePeople={handleDeletePeople}
                                    onEditPerson={async (personId, updates) => {
                                        try {
                                            const { id, createdAt, updatedAt, siteId, email, role } = updates as any

                                            await updatePerson({
                                                id: personId,
                                                firstName: updates.firstName,
                                                lastName: updates.lastName,
                                                email: email === null ? undefined : email,
                                                role: role === null ? undefined : role,
                                                x: updates.x ?? undefined,
                                                y: updates.y ?? undefined,
                                            })
                                            addToast({ type: 'success', title: 'Person Updated', message: 'Person updated successfully' })
                                        } catch (e) {
                                            addToast({ type: 'error', title: 'Error', message: (e as Error)?.message ?? 'Failed to update person' })
                                        }
                                    }}
                                />
                            </ResizablePanel>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Map View */}
                        <div
                            ref={mapContainerRef}
                            className="flex-1 min-w-0 flex flex-col"
                        >
                            {/* Content Area */}
                            <div className="flex-1 min-h-0 relative rounded-2xl shadow-[var(--shadow-strong)] border border-[var(--color-border-subtle)]" style={{ overflow: 'visible', minHeight: 0 }}>
                                {/* Toolbar - Top center */}
                                {mapUploaded && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30 pointer-events-none" style={{ transform: 'translateX(-50%) translateY(-50%)' }}>
                                        <PeopleToolbar
                                            mode={toolMode}
                                            onModeChange={setToolMode}
                                            selectedCount={selectedPersonIds.length || (selectedPersonId ? 1 : 0)}
                                        />
                                    </div>
                                )}

                                {/* Map Canvas */}
                                <div className="w-full h-full rounded-2xl overflow-hidden bg-[var(--color-bg-elevated)] relative">
                                    {!mapUploaded ? (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <div className="text-center text-[var(--color-text-muted)]">
                                                <p className="mb-2">No map uploaded</p>
                                                <p className="text-sm">Upload a map in Locations & Devices to place people</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className="w-full h-full"
                                            onDragOver={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                e.dataTransfer.dropEffect = 'move'
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleMapDrop(e)
                                            }}
                                        >
                                            <PeopleMapCanvasDynamic
                                                onPersonSelect={(id) => {
                                                    setSelectedPersonId(id)
                                                    if (id) {
                                                        setSelectedPersonIds([id])
                                                    }
                                                }}
                                                selectedPersonId={selectedPersonId}
                                                mapImageUrl={mapImageUrl}
                                                vectorData={vectorData}
                                                people={filteredPeople}
                                                mode={toolMode}
                                                onPersonMove={handlePersonMove}
                                                onPersonMoveEnd={handlePersonMoveEnd}
                                                currentLocation={currentLocation ? {
                                                    id: currentLocation.id,
                                                    name: currentLocation.name,
                                                    type: (currentLocation.type === 'base' || currentLocation.type === 'zoom' ? currentLocation.type : 'base') as 'base' | 'zoom',
                                                    parentLocationId: currentLocation.parentId || undefined,
                                                    imageUrl: currentLocation.imageUrl || undefined,
                                                    vectorData: null,
                                                    zoomBounds: typeof currentLocation.zoomBounds === 'object' &&
                                                        currentLocation.zoomBounds !== null &&
                                                        'minX' in currentLocation.zoomBounds &&
                                                        'minY' in currentLocation.zoomBounds &&
                                                        'maxX' in currentLocation.zoomBounds &&
                                                        'maxY' in currentLocation.zoomBounds
                                                        ? currentLocation.zoomBounds as { minX: number; minY: number; maxX: number; maxY: number }
                                                        : undefined,
                                                    createdAt: typeof currentLocation.createdAt === 'string'
                                                        ? new Date(currentLocation.createdAt).getTime()
                                                        : currentLocation.createdAt instanceof Date
                                                            ? currentLocation.createdAt.getTime()
                                                            : Date.now(),
                                                    updatedAt: typeof currentLocation.updatedAt === 'string'
                                                        ? new Date(currentLocation.updatedAt).getTime()
                                                        : currentLocation.updatedAt instanceof Date
                                                            ? currentLocation.updatedAt.getTime()
                                                            : Date.now(),
                                                } : null}
                                                onImageBoundsChange={setImageBounds}
                                                onScaleChange={setMapScale}
                                                onStagePositionChange={setMapPosition}
                                                externalScale={mapScale}
                                                externalStagePosition={mapPosition}
                                            />
                                        </div>
                                    )}

                                    {/* People Palette - Floating (inside map container) */}
                                    {mapUploaded && (
                                        <PeoplePalette
                                            people={filteredPeople}
                                            selectedPersonIds={selectedPersonIds}
                                            onSelectionChange={setSelectedPersonIds}
                                            onDragStart={handlePaletteDragStart}
                                            onAdd={handleCreatePerson}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* People Panel - Right Side */}
                        <div ref={panelRef}>
                            <ResizablePanel
                                defaultWidth={384}
                                minWidth={320}
                                maxWidth={512}
                                collapseThreshold={200}
                                storageKey="people_panel"
                            >
                                <PeoplePanel
                                    people={people}
                                    selectedPersonId={selectedPersonId}
                                    onPersonSelect={setSelectedPersonId}
                                    onCreatePerson={handleCreatePerson}
                                    onDeletePerson={handleDeletePerson}
                                    onDeletePeople={handleDeletePeople}
                                    onEditPerson={async (personId, updates) => {
                                        try {
                                            const { id, createdAt, updatedAt, siteId, email, role } = updates as any

                                            await updatePerson({
                                                id: personId,
                                                firstName: updates.firstName,
                                                lastName: updates.lastName,
                                                email: email === null ? undefined : email,
                                                role: role === null ? undefined : role,
                                                x: updates.x ?? undefined,
                                                y: updates.y ?? undefined,
                                            })
                                            addToast({ type: 'success', title: 'Person Updated', message: 'Person updated successfully' })
                                        } catch (e) {
                                            addToast({ type: 'error', title: 'Error', message: (e as Error)?.message ?? 'Failed to update person' })
                                        }
                                    }}
                                />
                            </ResizablePanel>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
