// Domain model for the Avignon Off planner.

/** A single dated performance ("représentation") of a show. */
export interface Performance {
  id: string
  /** ISO 8601 local datetime of the start, e.g. "2026-07-10T14:30". */
  start: string
  /**
   * Ticket'Off availability for this date:
   * - `online`: bookable online, seats remaining (`seatsLeft`).
   * - `quota`: online quota reached ("quota atteint") — not bookable online,
   *   but often still available at the box office.
   * - `closed`: online sale closed, relâche or past date.
   */
  status?: 'online' | 'quota' | 'closed'
  /**
   * Schedulable at all (online or box-office). `false` = closed/past.
   * Kept for convenience; derived from `status`.
   */
  available?: boolean
  /** Remaining online seats (only when `status === 'online'`). */
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

/** Distance-aware buffering between venues (walking time). */
export interface TravelSettings {
  enabled: boolean
  /** Unhurried walking speed (km/h). */
  walkSpeedKmh: number
  /** Floor for the buffer, even between adjacent venues (min). */
  minBufferMin: number
  /** Fixed overhead added to walking time (exit/enter/seat, min). */
  marginMin: number
}

export interface PlannerSettings {
  /** Gap between two shows when distance mode is off, and fallback for venues
   * with unknown coordinates. In minutes. */
  bufferMin: number
  weightMode: WeightMode
  meals: MealBreak[]
  travel: TravelSettings
  /** Only schedule séances bookable online (exclude "quota atteint"). */
  onlineOnly: boolean
}

export const DEFAULT_TRAVEL: TravelSettings = {
  enabled: true,
  walkSpeedKmh: 4.5,
  minBufferMin: 15,
  marginMin: 5,
}

export const DEFAULT_MEALS: MealBreak[] = [
  { id: 'lunch', label: 'Déjeuner', windowStart: '12:00', windowEnd: '14:30', durationMin: 60, enabled: true },
  { id: 'dinner', label: 'Dîner', windowStart: '19:00', windowEnd: '21:00', durationMin: 60, enabled: true },
]

export const DEFAULT_SETTINGS: PlannerSettings = {
  bufferMin: 30,
  weightMode: 'balanced',
  meals: DEFAULT_MEALS,
  travel: DEFAULT_TRAVEL,
  onlineOnly: false,
}
