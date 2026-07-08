// Domain model for the Avignon Off planner.

/** A single dated performance ("représentation") of a show. */
export interface Performance {
  id: string
  /** ISO 8601 local datetime of the start, e.g. "2026-07-10T14:30". */
  start: string
  /**
   * Public availability. `false` means known sold out ("complet").
   * `undefined`/`true` means bookable (or unknown → treated as bookable).
   */
  available?: boolean
  /** Remaining seats, when scraped from Ticket'Off. */
  seatsLeft?: number
}

/** A show ("spectacle") with a fixed venue, duration and a list of performances. */
export interface Show {
  id: string
  title: string
  company?: string
  genre?: string
  venue: string
  /** Running time in minutes. */
  durationMin: number
  performances: Performance[]
  /** Ticket'Off / booking URL for this show. */
  ticketUrl?: string
}

export interface Catalog {
  /** Source label + when it was produced. */
  source: string
  generatedAt?: string
  shows: Show[]
}

/** A window during which the user is present at the festival. */
export interface PresenceWindow {
  id: string
  /** ISO date "2026-07-10". */
  date: string
  /** "HH:MM" local start of availability that day. */
  start: string
  /** "HH:MM" local end of availability that day. */
  end: string
}

/** An entry in the ordered wishlist. Order = preference (index 0 = top choice). */
export interface WishItem {
  showId: string
  /** User can force-exclude a show without removing it from the list. */
  excluded?: boolean
}

export type WeightMode = 'balanced' | 'top-priority'

/** A daily free slot to reserve (meal), placed anywhere inside its window. */
export interface MealBreak {
  id: string
  label: string
  /** "HH:MM" earliest the free slot may start. */
  windowStart: string
  /** "HH:MM" latest the free slot may end. */
  windowEnd: string
  /** Length of free time to reserve, in minutes. */
  durationMin: number
  enabled: boolean
}

export interface PlannerSettings {
  /** Minimum gap between two consecutive shows, in minutes. */
  bufferMin: number
  weightMode: WeightMode
  meals: MealBreak[]
}

export const DEFAULT_MEALS: MealBreak[] = [
  { id: 'lunch', label: 'Déjeuner', windowStart: '12:00', windowEnd: '14:30', durationMin: 60, enabled: true },
  { id: 'dinner', label: 'Dîner', windowStart: '19:00', windowEnd: '21:00', durationMin: 60, enabled: true },
]

export const DEFAULT_SETTINGS: PlannerSettings = {
  bufferMin: 30,
  weightMode: 'balanced',
  meals: DEFAULT_MEALS,
}
