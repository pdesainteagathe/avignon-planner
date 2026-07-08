import { describe, it, expect } from 'vitest'
import { plan } from './planning'
import { sampleCatalog } from '../data/sampleCatalog'
import { dateTimeToMs, isoToMs } from './time'
import { DEFAULT_SETTINGS, type PresenceWindow, type WishItem } from '../types'

const windows: PresenceWindow[] = [
  { id: 'w1', date: '2026-07-08', start: '10:00', end: '23:59' },
  { id: 'w2', date: '2026-07-09', start: '10:00', end: '18:00' },
]

// Take the first 8 sample shows as a wishlist in catalog order.
const wishlist: WishItem[] = sampleCatalog.shows.slice(0, 8).map((s) => ({ showId: s.id }))

describe('plan (integration on sample catalog)', () => {
  const result = plan(sampleCatalog, wishlist, windows, DEFAULT_SETTINGS)

  it('schedules at least a few shows', () => {
    expect(result.scheduled.length).toBeGreaterThanOrEqual(3)
  })

  it('never double-books a show', () => {
    const ids = result.scheduled.map((s) => s.show.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('respects the 30-minute buffer between consecutive shows', () => {
    const sorted = [...result.scheduled].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end + 30 * 60_000)
    }
  })

  it('keeps every scheduled performance inside a presence window', () => {
    const wins = windows.map((w) => ({
      start: dateTimeToMs(w.date, w.start),
      end: dateTimeToMs(w.date, w.end),
    }))
    for (const it of result.scheduled) {
      expect(wins.some((w) => it.start >= w.start && it.end <= w.end)).toBe(true)
    }
  })

  it('flags shows outside the presence windows correctly', () => {
    // s13 "Tragédie express" plays at 22:15 → impossible on day 2 (ends 18:00),
    // but day 1 ends 23:59 so it should NOT be outside-windows here; instead
    // pick a show that only plays late and restrict to the short window.
    const shortWin: PresenceWindow[] = [
      { id: 'w', date: '2026-07-08', start: '10:00', end: '12:00' },
    ]
    const r = plan(
      sampleCatalog,
      [{ showId: 's13' }], // plays 22:15
      shortWin,
      DEFAULT_SETTINGS,
    )
    expect(r.scheduled.length).toBe(0)
    expect(r.unscheduled[0].reason).toBe('outside-windows')
  })

  it('reports sold-out when every performance is complet', () => {
    const complet = {
      source: 'test',
      shows: [
        {
          id: 'x',
          title: 'Complet partout',
          venue: 'Test',
          durationMin: 60,
          performances: [
            { id: 'x1', start: '2026-07-08T14:00', available: false },
            { id: 'x2', start: '2026-07-09T14:00', available: false },
          ],
        },
      ],
    }
    const r = plan(
      complet,
      [{ showId: 'x' }],
      [{ id: 'a', date: '2026-07-08', start: '10:00', end: '23:59' }],
      DEFAULT_SETTINGS,
    )
    expect(r.scheduled.length).toBe(0)
    expect(r.unscheduled[0].reason).toBe('sold-out')
  })

  it('reserves a free hour for lunch (12:00–14:30) and dinner (19:00–21:00)', () => {
    // Day 1 present 10:00–23:59 → lunch + dinner reservable.
    // Day 2 present 10:00–18:00 → lunch only (dinner window is outside).
    for (const b of result.breaks) {
      expect(b.end - b.start).toBe(60 * 60_000)
      const h = new Date(b.start).getHours()
      const endH = new Date(b.end).getHours() + new Date(b.end).getMinutes() / 60
      if (b.label === 'Déjeuner') {
        expect(h).toBeGreaterThanOrEqual(12)
        expect(endH).toBeLessThanOrEqual(14.5)
      } else {
        expect(h).toBeGreaterThanOrEqual(19)
        expect(endH).toBeLessThanOrEqual(21)
      }
      // No scheduled show may overlap a reserved break.
      for (const s of result.scheduled) {
        expect(s.start < b.end && b.start < s.end).toBe(false)
      }
    }
    expect(result.breaks.some((b) => b.label === 'Déjeuner')).toBe(true)
  })

  it('sanity: satisfaction never exceeds the theoretical max', () => {
    expect(result.totalWeight).toBeLessThanOrEqual(result.maxWeight)
    expect(isoToMs('2026-07-08T10:00')).toBeLessThan(isoToMs('2026-07-08T10:01'))
  })
})
