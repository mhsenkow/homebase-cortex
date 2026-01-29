'use client'

import { useState, useRef } from 'react'
import { SearchIsland } from '@/components/layout/SearchIsland'
import { Switch } from '@/components/ui/Switch'
import { ResizablePanel } from '@/components/layout/ResizablePanel'
import { GroupsListView } from '@/components/groups/GroupsListView'
import { GroupsPanel } from '@/components/groups/GroupsPanel'
import { GroupsViewToggle, type GroupsFilterMode } from '@/components/groups/GroupsViewToggle'
import { useGroups } from '@/lib/hooks/useGroups'
import { usePeople } from '@/lib/hooks/usePeople'
import { useSite } from '@/lib/SiteContext'
import { useDevices } from '@/lib/DomainContext'
import { useToast } from '@/lib/ToastContext'

export default function GroupsPage() {
    const { groups, isLoading: groupsLoading, addGroup, updateGroup, deleteGroup } = useGroups()
    const { activeSiteId } = useSite()
    const { devices } = useDevices()
    const { people } = usePeople()
    const { addToast } = useToast()

    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [filterMode, setFilterMode] = useState<GroupsFilterMode>('both')
    const [hideEmptyGroups, setHideEmptyGroups] = useState(false)
    const [panelOpenTrigger, setPanelOpenTrigger] = useState(0)
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    // Groups are auto-synced by useGroupSync in StateHydration

    const handleMainContentClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement
        if (
            mapContainerRef.current &&
            panelRef.current &&
            !mapContainerRef.current.contains(target) &&
            !panelRef.current.contains(target)
        ) {
            setSelectedGroupId(null)
        }
    }

    const handleCreateGroup = async () => {
        if (!activeSiteId) {
            addToast({ type: 'error', title: 'Error', message: 'No site selected' })
            return
        }

        try {
            const newGroup = await addGroup({
                name: 'New Group',
                description: '',
                color: '#4c7dff',
                siteId: activeSiteId,
                deviceIds: [],
                personIds: [],
            })
            setSelectedGroupId(newGroup.id)
            addToast({ type: 'success', title: 'Group Created', message: 'New group created successfully' })
        } catch (error) {
            addToast({ type: 'error', title: 'Error', message: (error as Error)?.message ?? 'Failed to create group' })
        }
    }

    const handleCreateGroupWithItems = async (personIds: string[], deviceIds: string[]) => {
        if (!activeSiteId) {
            addToast({ type: 'error', title: 'Error', message: 'No site selected' })
            return
        }

        const itemCount = personIds.length + deviceIds.length
        try {
            const newGroup = await addGroup({
                name: 'New Group',
                description: '',
                color: '#4c7dff',
                siteId: activeSiteId,
                deviceIds,
                personIds,
            })
            setSelectedGroupId(newGroup.id)
            addToast({ type: 'success', title: 'Group Created', message: `New group created with ${itemCount} item${itemCount !== 1 ? 's' : ''}` })
        } catch (error) {
            addToast({ type: 'error', title: 'Error', message: (error as Error)?.message ?? 'Failed to create group' })
        }
    }

    const handleDeleteGroup = async (groupId: string) => {
        try {
            await deleteGroup(groupId)
            if (selectedGroupId === groupId) {
                setSelectedGroupId(null)
            }
            addToast({ type: 'success', title: 'Group Deleted', message: 'Group deleted successfully' })
        } catch (error) {
            addToast({ type: 'error', title: 'Error', message: (error as Error)?.message ?? 'Failed to delete group' })
        }
    }

    const handleDeleteGroups = async (groupIds: string[]) => {
        try {
            await Promise.all(groupIds.map(id => deleteGroup(id)))
            if (selectedGroupId && groupIds.includes(selectedGroupId)) {
                setSelectedGroupId(null)
            }
            addToast({ type: 'success', title: 'Groups Deleted', message: `${groupIds.length} groups deleted successfully` })
        } catch (error) {
            addToast({ type: 'error', title: 'Error', message: (error as Error)?.message ?? 'Failed to delete groups' })
        }
    }

    const handleAddToGroup = async (groupId: string, itemIds: string[], type: 'devices' | 'people'): Promise<void> => {
        const group = groups.find(g => g.id === groupId)
        if (!group) return

        try {
            if (type === 'devices') {
                const newDeviceIds = [...new Set([...group.deviceIds, ...itemIds])]
                await updateGroup({
                    id: groupId,
                    deviceIds: newDeviceIds,
                })
            } else {
                const currentPersonIds = group.personIds ?? []
                const newPersonIds = [...new Set([...currentPersonIds, ...itemIds])]
                await updateGroup({
                    id: groupId,
                    personIds: newPersonIds,
                })
            }
            addToast({ type: 'success', title: 'Added to Group', message: `${itemIds.length} ${type} added to ${group.name}` })
        } catch (error) {
            addToast({ type: 'error', title: 'Error', message: (error as Error)?.message ?? 'Failed to add items to group' })
        }
    }

    const handleItemMove = async (itemId: string, itemType: 'person' | 'device', fromGroupId: string | null, toGroupId: string, copy = false) => {
        // Remove from source group only if moving (not copying) and has a source
        if (fromGroupId && !copy) {
            const fromGroup = groups.find(g => g.id === fromGroupId)
            if (fromGroup) {
                try {
                    if (itemType === 'person') {
                        const newPersonIds = (fromGroup.personIds ?? []).filter(id => id !== itemId)
                        await updateGroup({ id: fromGroupId, personIds: newPersonIds })
                    } else {
                        const newDeviceIds = fromGroup.deviceIds.filter(id => id !== itemId)
                        await updateGroup({ id: fromGroupId, deviceIds: newDeviceIds })
                    }
                } catch (error) {
                    addToast({ type: 'error', title: 'Error', message: (error as Error)?.message ?? 'Failed to remove from group' })
                }
            }
        }

        const toGroup = groups.find(g => g.id === toGroupId)
        if (toGroup) {
            // Check if already in destination group
            const alreadyInGroup = itemType === 'person'
                ? (toGroup.personIds ?? []).includes(itemId)
                : toGroup.deviceIds.includes(itemId)

            if (alreadyInGroup) {
                addToast({ type: 'info', title: 'Already in group', message: `This ${itemType} is already in ${toGroup.name}` })
                return
            }

            try {
                if (itemType === 'person') {
                    const newPersonIds = [...new Set([...(toGroup.personIds ?? []), itemId])]
                    await updateGroup({ id: toGroupId, personIds: newPersonIds })
                } else {
                    const newDeviceIds = [...new Set([...toGroup.deviceIds, itemId])]
                    await updateGroup({ id: toGroupId, deviceIds: newDeviceIds })
                }
                const action = copy ? 'Added to' : 'Moved to'
                addToast({ type: 'success', title: action, message: `${itemType === 'person' ? 'Person' : 'Device'} ${action.toLowerCase()} ${toGroup.name}` })
            } catch (error) {
                addToast({ type: 'error', title: 'Error', message: (error as Error)?.message ?? 'Failed to move item' })
            }
        }
    }

    return (
        <div className="h-full flex flex-col min-h-0 overflow-hidden">
            {/* Top Search Island */}
            <div className="flex-shrink-0 page-padding-x pt-3 md:pt-4 pb-2 md:pb-3 relative">
                <SearchIsland
                    position="top"
                    fullWidth={true}
                    showActions={true}
                    title="Groups"
                    subtitle="Manage groups of devices and/or people"
                    placeholder="Search groups..."
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    onActionDetected={(action) => {
                        if (action.id === 'create-group') {
                            handleCreateGroup()
                        }
                    }}
                />
            </div>

            {/* Main Content */}
            <div
                className="main-content-area flex-1 flex min-h-0 gap-2 md:gap-4 page-padding-x"
                style={{ overflow: 'visible' }}
                onClick={handleMainContentClick}
            >
                {/* List View - Left Side */}
                <div
                    ref={mapContainerRef}
                    className="flex-1 relative min-w-0 flex flex-col"
                    style={{ overflow: 'visible', minHeight: 0 }}
                >
                    {/* Filter Tabs + Hide empty */}
                    <div className="mb-2 md:mb-3 flex items-center justify-between gap-4 flex-wrap">
                        <GroupsViewToggle currentFilter={filterMode} onFilterChange={setFilterMode} />
                        <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] cursor-pointer select-none">
                            <Switch
                                checked={hideEmptyGroups}
                                onCheckedChange={setHideEmptyGroups}
                                id="groups-hide-empty"
                            />
                            <span>Hide empty groups</span>
                        </label>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-h-0 rounded-2xl shadow-[var(--shadow-strong)] border border-[var(--color-border-subtle)] overflow-hidden">
                        <div className="w-full h-full bg-[var(--color-surface)]">
                            {groupsLoading ? (
                                <div className="w-full h-full flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                                        <span className="text-sm text-[var(--color-text-muted)]">Loading groups...</span>
                                    </div>
                                </div>
                            ) : (
                                <GroupsListView
                                    groups={groups}
                                    selectedGroupId={selectedGroupId}
                                    onGroupSelect={setSelectedGroupId}
                                    searchQuery={searchQuery}
                                    filterMode={filterMode}
                                    hideEmptyGroups={hideEmptyGroups}
                                    tieredView={filterMode === 'both'}
                                    people={people}
                                    devices={devices}
                                    onItemMove={handleItemMove}
                                    onCreateGroup={handleCreateGroup}
                                    onAddToGroup={(groupId) => {
                                        setSelectedGroupId(groupId)
                                        setPanelOpenTrigger((t) => t + 1)
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    {/* Keyboard hints footer */}
                    <div className="flex-shrink-0 px-4 py-2 text-xs text-[var(--color-text-muted)] flex items-center gap-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]/50">
                        <span>
                            <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border-subtle)] font-mono text-[10px]">Drag</kbd>
                            {' '}to move between groups
                        </span>
                        <span>
                            <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border-subtle)] font-mono text-[10px]">Shift</kbd>
                            {' '}+ drag to copy (keep in both)
                        </span>
                    </div>
                </div>

                {/* Groups Panel - Right Side */}
                <div ref={panelRef}>
                    <ResizablePanel
                        defaultWidth={384}
                        minWidth={320}
                        maxWidth={512}
                        collapseThreshold={200}
                        storageKey="groups_panel"
                        openTrigger={panelOpenTrigger}
                    >
                        <GroupsPanel
                            groups={groups}
                            selectedGroupId={selectedGroupId}
                            onGroupSelect={setSelectedGroupId}
                            onCreateGroup={handleCreateGroup}
                            onCreateGroupWithItems={handleCreateGroupWithItems}
                            onDeleteGroup={handleDeleteGroup}
                            onDeleteGroups={handleDeleteGroups}
                            onItemMove={handleItemMove}
                            onEditGroup={async (groupId, updates) => {
                                try {
                                    await updateGroup({
                                        id: groupId,
                                        name: updates.name,
                                        description: updates.description,
                                        color: updates.color,
                                        deviceIds: updates.deviceIds,
                                        personIds: updates.personIds,
                                    })
                                    addToast({ type: 'success', title: 'Group Updated', message: 'Group updated successfully' })
                                } catch (e) {
                                    addToast({ type: 'error', title: 'Error', message: (e as Error)?.message ?? 'Failed to update group' })
                                }
                            }}
                            devices={devices}
                            people={people}
                            filterMode={filterMode}
                            onAddToGroup={handleAddToGroup}
                        />
                    </ResizablePanel>
                </div>
            </div>
        </div>
    )
}
