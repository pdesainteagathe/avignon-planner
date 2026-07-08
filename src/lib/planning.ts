import type {
  Catalog,
  PlannerSettings,
  PresenceWindow,
  Show,
  WishItem,
} from '../types'
import { addMinutes, dateTimeToMs, isoToMs } from './time'
import { optimize, type Candidate } from './optimizer'
import { weightForRank } from './weights'

export type UnscheduledReason =
  | 'excluded' // user turned it off
  | 'sold-out' // performances exist but all marked complet
  | 'outside-windows' // bookable performances exist but none fit the presence windows
  | 'no-performances' // show has no performances at all
  | 'conflict' // feasible, but a better-ranked set won the slot

export interface ScheduledItem {
  show: Show
  perfId: string
  start: number
  end: number
  rank: number
  weight: number
  seatsLeft?: number
}

export interface UnscheduledItem {
  show: Show
  rank: number
  reason: UnscheduledReason
}

export interface DayGroup {
  dayKey: string
  items: ScheduledItem[]
}

export interface PlanResult {
  scheduled: ScheduledItem[]
  unscheduled: UnscheduledItem[]
  days: DayGroup[]
  totalWeight: number
  /** Sum of weights of all included wished shows — the theoretical max. */
  maxWeight: number
  approximate: boolean
}

interface WindowMs {
  start: number
  end: number
}

function toWindowMs(w: PresenceWindow): WindowMs {
  return { start: dateTimeToMs(w.date, w.start), end: dateTimeToMs(w.date, w.end) }
}

function fitsAnyWindow(start: number, end: number, windows: WindowMs[]): boolean {
  return windows.some((w) => start >= w.start && end <= w.end)
}

/**
 * Build the optimizer input from user selections, and pre-diagnose why some
 * shows cannot be scheduled at all (independent of the final optimization).
 */
export function plan(
  catalog: Catalog,
  wishlist: WishItem[],
  windows: PresenceWindow[],
  settings: PlannerSettings,
): PlanResult {
  const byId = new Map(catalog.shows.map((s) => [s.id, s]))
  const included = wishlist.filter((w) => !w.excluded && byId.has(w.showId))
  const total = included.length
  const windowsMs = windows.map(toWindowMs)

  const candidates: Candidate[] = []
  // Per-show diagnosis for shows that produce no feasible candidate.
  const rankOf = new Map<string, number>()
  const blocked = new Map<string, UnscheduledReason>()

  included.forEach((wish, idx) => {
    const show = byId.get(wish.showId)!
    const rank = idx // 0-based
    rankOf.set(show.id, rank)
    const weight = weightForRank(rank, total, settings.weightMode)

    if (show.performances.length === 0) {
      blocked.set(show.id, 'no-performances')
      return
    }

    let anyAvailable = false
    let anyFitting = false
    for (const perf of show.performances) {
      if (perf.available === false) continue
      anyAvailable = true
      const start = isoToMs(perf.start)
      const end = addMinutes(start, show.durationMin)
      if (!fitsAnyWindow(start, end, windowsMs)) continue
      anyFitting = true
      candidates.push({ showId: show.id, perfId: perf.id, start, end, weight })
    }

    if (!anyAvailable) blocked.set(show.id, 'sold-out')
    else if (!anyFitting) blocked.set(show.id, 'outside-windows')
  })

  const bufferMs = settings.bufferMin * 60_000
  const result = optimize(candidates, bufferMs)

  const chosenShowIds = new Set(result.chosen.map((c) => c.showId))
  const scheduled: ScheduledItem[] = result.chosen.map((c) => {
    const show = byId.get(c.showId)!
    const perf = show.performances.find((p) => p.id === c.perfId)
    return {
      show,
      perfId: c.perfId,
      start: c.start,
      end: c.end,
      rank: rankOf.get(c.showId)!,
      weight: c.weight,
      seatsLeft: perf?.seatsLeft,
    }
  })
  scheduled.sort((a, b) => a.start - b.start)

  const unscheduled: UnscheduledItem[] = []
  for (const wish of wishlist) {
    const show = byId.get(wish.showId)
    if (!show) continue
    const rank = rankOf.get(show.id) ?? -1
    if (wish.excluded) {
      unscheduled.push({ show, rank, reason: 'excluded' })
      continue
    }
    if (chosenShowIds.has(show.id)) continue
    const reason: UnscheduledReason = blocked.get(show.id) ?? 'conflict'
    unscheduled.push({ show, rank, reason })
  }
  // Keep unscheduled in preference order (excluded ones, ranked -1, go last).
  unscheduled.sort((a, b) => (a.rank < 0 ? 1 : b.rank < 0 ? -1 : a.rank - b.rank))

  const days = groupByDay(scheduled)
  const maxWeight = included.reduce(
    (s, _w, idx) => s + weightForRank(idx, total, settings.weightMode),
    0,
  )

  return {
    scheduled,
    unscheduled,
    days,
    totalWeight: result.totalWeight,
    maxWeight,
    approximate: result.approximate,
  }
}

function groupByDay(items: ScheduledItem[]): DayGroup[] {
  const map = new Map<string, ScheduledItem[]>()
  for (const it of items) {
    const d = new Date(it.start)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(it)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, items]) => ({ dayKey, items }))
}
