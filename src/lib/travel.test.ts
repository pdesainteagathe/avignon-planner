import { describe, it, expect } from 'vitest'
import { haversineMeters, walkMinutes, travelBufferMin, type TravelConfig } from './travel'
import { plan } from './planning'
import { DEFAULT_SETTINGS, type Catalog, type PresenceWindow, type WishItem } from '../types'

const A = { lat: 43.944, lng: 4.806 }
const A2 = { lat: 43.9445, lng: 4.8065 } // ~70 m from A
const FAR = { lat: 43.9628, lng: 4.7955 } // Villeneuve, ~2 km

const cfg: TravelConfig = { enabled: true, walkSpeedKmh: 4.5, minBufferMin: 15, marginMin: 5, fallbackMin: 30 }

describe('travel utils', () => {
  it('haversine is 0 for the same point and grows with distance', () => {
    expect(haversineMeters(A, A)).toBeCloseTo(0, 5)
    expect(haversineMeters(A, A2)).toBeLessThan(haversineMeters(A, FAR))
  })

  it('buffer floors at minBufferMin for nearby venues', () => {
    expect(travelBufferMin(A, A, cfg)).toBe(15)
    expect(travelBufferMin(A, A2, cfg)).toBe(15)
  })

  it('buffer grows for far venues', () => {
    expect(travelBufferMin(A, FAR, cfg)).toBeGreaterThan(20)
  })

  it('falls back for unknown coordinates or when disabled', () => {
    expect(travelBufferMin(A, undefined, cfg)).toBe(30)
    expect(travelBufferMin(A, FAR, { ...cfg, enabled: false })).toBe(30)
  })

  it('walkMinutes is undefined when a venue is unknown', () => {
    expect(walkMinutes(A, undefined, 4.5)).toBeUndefined()
  })
})

// Two shows 15 min apart at adjacent venues: allowed with distance mode,
// rejected with the fixed 30-min buffer.
const catalog: Catalog = {
  source: 'test',
  shows: [
    { id: 'A', title: 'A', venue: 'X', durationMin: 60, performances: [{ id: 'a1', start: '2026-07-08T10:00', available: true }] },
    { id: 'B', title: 'B', venue: 'Y', durationMin: 45, performances: [{ id: 'b1', start: '2026-07-08T11:15', available: true }] },
  ],
}
const wishlist: WishItem[] = [{ showId: 'A' }, { showId: 'B' }]
// Window avoids the lunch block (ends 12:30 → lunch region < 60 min).
const windows: PresenceWindow[] = [{ id: 'w', date: '2026-07-08', start: '09:00', end: '12:30' }]
const venues = { X: A, Y: A2 }

describe('plan with venue distances', () => {
  it('fits two nearby shows 15 min apart when distance mode is on', () => {
    const r = plan(catalog, wishlist, windows, DEFAULT_SETTINGS, venues)
    expect(r.scheduled.length).toBe(2)
    // The second show carries a walking-time annotation.
    const day = r.days[0]
    const secondShow = day.entries.filter((e) => e.kind === 'show')[1]
    expect(secondShow.kind === 'show' && secondShow.walkFromPrevMin).toBeDefined()
  })

  it('rejects one of them with a fixed 30-min buffer', () => {
    const fixed = { ...DEFAULT_SETTINGS, travel: { ...DEFAULT_SETTINGS.travel, enabled: false }, bufferMin: 30 }
    const r = plan(catalog, wishlist, windows, fixed, venues)
    expect(r.scheduled.length).toBe(1)
  })
})
