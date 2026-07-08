import type {
  Catalog,
  MealBreak,
  PlannerSettings,
  PresenceWindow,
  Show,
  WishItem,
} from '../types'
import { addMinutes, dateTimeToMs, dayKey, isoToMs } from './time'
import { optimize, type Candidate } from './optimizer'
import { weightForRank } from './weights'

export type UnscheduledReason =
  | 'excluded'
  | 'sold-out'
  | 'outside-windows'
  | 'no-performances'
  | 'conflict'

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

/** A reserved free slot (meal) in the final plan. */
export interface BreakItem {
  label: string
  start: number
  end: number
}

export type TimelineEntry =
  | ({ kind: 'show' } & ScheduledItem)
  | ({ kind: 'break' } & BreakItem)

export interface DayGroup {
  dayKey: string
  entries: TimelineEntry[]
}

export interface PlanResult {
  scheduled: ScheduledItem[]
  breaks: BreakItem[]
  unscheduled: UnscheduledItem[]
  days: DayGroup[]
  totalWeight: number
  maxWeight: number
  approximate: boolean
}

// Meal breaks are mandatory: a weight far above any achievable sum of show
// weights means the optimizer never sacrifices a break to fit more shows.
const BREAK_WEIGHT = 1_000_000
const MEAL_STEP_MIN = 15

interface WindowMs {
  start: number
  end: number
}

function fitsAnyWindow(start: number, end: number, windows: WindowMs[]): boolean {
  return windows.some((w) => start >= w.start && end <= w.end)
}

/** Build sliding candidate slots for each enabled meal, per presence day. */
function mealCandidates(
  windows: PresenceWindow[],
  meals: MealBreak[],
): { candidates: Candidate[]; labels: Map<string, string> } {
  const out: Candidate[] = []
  const labels = new Map<string, string>()
  const step = MEAL_STEP_MIN * 60_000
  for (const meal of meals) {
    if (!meal.enabled) continue
    const dur = meal.durationMin * 60_000
    for (const w of windows) {
      const regionStart = Math.max(dateTimeToMs(w.date, w.start), dateTimeToMs(w.date, meal.windowStart))
      const regionEnd = Math.min(dateTimeToMs(w.date, w.end), dateTimeToMs(w.date, meal.windowEnd))
      if (regionEnd - regionStart < dur) continue
      const showId = `meal-${meal.id}-${w.date}`
      labels.set(showId, meal.label)
      for (let s = regionStart; s + dur <= regionEnd; s += step) {
        out.push({ showId, perfId: `${showId}-${out.length}`, start: s, end: s + dur, weight: BREAK_WEIGHT, isBreak: true })
      }
    }
  }
  return { candidates: out, labels }
}

export function plan(
  catalog: Catalog,
  wishlist: WishItem[],
  windows: PresenceWindow[],
  settings: PlannerSettings,
): PlanResult {
  const byId = new Map(catalog.shows.map((s) => [s.id, s]))
  const included = wishlist.filter((w) => !w.excluded && byId.has(w.showId))
  const total = included.length
  const windowsMs = windows.map((w) => ({
    start: dateTimeToMs(w.date, w.start),
    end: dateTimeToMs(w.date, w.end),
  }))

  const candidates: Candidate[] = []
  const rankOf = new Map<string, number>()
  const blocked = new Map<string, UnscheduledReason>()

  included.forEach((wish, idx) => {
    const show = byId.get(wish.showId)!
    rankOf.set(show.id, idx)
    const weight = weightForRank(idx, total, settings.weightMode)

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

  const { candidates: mealCands, labels: mealLabels } = mealCandidates(windows, settings.meals)

  const bufferMs = settings.bufferMin * 60_000
  const result = optimize([...candidates, ...mealCands], bufferMs)

  const chosenShows = result.chosen.filter((c) => !c.isBreak)
  const chosenBreaks = result.chosen.filter((c) => c.isBreak)
  const chosenShowIds = new Set(chosenShows.map((c) => c.showId))

  const scheduled: ScheduledItem[] = chosenShows.map((c) => {
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

  const breaks: BreakItem[] = chosenBreaks
    .map((c) => ({ label: mealLabels.get(c.showId) ?? 'Pause', start: c.start, end: c.end }))
    .sort((a, b) => a.start - b.start)

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
    unscheduled.push({ show, rank, reason: blocked.get(show.id) ?? 'conflict' })
  }
  unscheduled.sort((a, b) => (a.rank < 0 ? 1 : b.rank < 0 ? -1 : a.rank - b.rank))

  const days = groupDays(scheduled, breaks)
  const totalWeight = scheduled.reduce((s, it) => s + it.weight, 0)
  const maxWeight = included.reduce((s, _w, idx) => s + weightForRank(idx, total, settings.weightMode), 0)

  return { scheduled, breaks, unscheduled, days, totalWeight, maxWeight, approximate: result.approximate }
}

function groupDays(scheduled: ScheduledItem[], breaks: BreakItem[]): DayGroup[] {
  const map = new Map<string, TimelineEntry[]>()
  const push = (key: string, entry: TimelineEntry) => {
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  }
  for (const it of scheduled) push(dayKey(it.start), { kind: 'show', ...it })
  for (const b of breaks) push(dayKey(b.start), { kind: 'break', ...b })
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dk, entries]) => ({
      dayKey: dk,
      entries: entries.sort((a, b) => a.start - b.start),
    }))
}
