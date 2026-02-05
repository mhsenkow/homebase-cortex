/**
 * Dashboard View Store
 *
 * Shared state for the dashboard view toggle (map vs grid).
 * Persisted to localStorage so the preference survives reloads.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DashboardViewMode = 'map' | 'grid'

interface DashboardViewState {
  viewMode: DashboardViewMode
  setViewMode: (mode: DashboardViewMode) => void
}

export const useDashboardViewStore = create<DashboardViewState>()(
  persist(
    (set) => ({
      viewMode: 'map',
      setViewMode: (viewMode) => set({ viewMode }),
    }),
    { name: 'dashboard-view-mode' }
  )
)
