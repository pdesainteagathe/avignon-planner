import type { PlannerSettings, PresenceWindow, WishItem } from '../types'
import { DEFAULT_SETTINGS } from '../types'

const KEY = 'avignon-planner-state-v1'

export interface PersistedState {
  windows: PresenceWindow[]
  wishlist: WishItem[]
  settings: PlannerSettings
  /** Performances the user has marked as booked (perfId -> true). */
  booked: Record<string, boolean>
}

const EMPTY: PersistedState = {
  windows: [],
  wishlist: [],
  settings: DEFAULT_SETTINGS,
  booked: {},
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw)
    return {
      windows: parsed.windows ?? [],
      wishlist: parsed.wishlist ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      booked: parsed.booked ?? {},
    }
  } catch {
    return EMPTY
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // ignore quota / private-mode errors
  }
}
