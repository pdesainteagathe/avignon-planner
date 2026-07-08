import type { PlannerSettings, PresenceWindow, WishItem } from '../types'
import { DEFAULT_SETTINGS } from '../types'

const KEY = 'avignon-planner-state-v1'

export interface PersistedState {
  windows: PresenceWindow[]
  wishlist: WishItem[]
  settings: PlannerSettings
}

const EMPTY: PersistedState = {
  windows: [],
  wishlist: [],
  settings: DEFAULT_SETTINGS,
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
