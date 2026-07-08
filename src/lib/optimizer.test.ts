import { describe, it, expect } from 'vitest'
import { optimize, type Candidate } from './optimizer'

// Helper: build a candidate from hour offsets (minutes since an arbitrary epoch).
function c(showId: string, perfId: string, startMin: number, durMin: number, weight: number): Candidate {
  const start = startMin * 60_000
  return { showId, perfId, start, end: start + durMin * 60_000, weight }
}

const BUFFER = 30 * 60_000

describe('optimize', () => {
  it('returns empty for no candidates', () => {
    const r = optimize([], BUFFER)
    expect(r.chosen).toEqual([])
    expect(r.totalWeight).toBe(0)
  })

  it('schedules a single show', () => {
    const r = optimize([c('a', 'a1', 600, 90, 5)], BUFFER)
    expect(r.chosen.map((x) => x.showId)).toEqual(['a'])
    expect(r.totalWeight).toBe(5)
  })

  it('respects the 30-minute buffer between shows', () => {
    // a: 10:00-11:30, b starts 11:45 → only 15 min gap → cannot take both.
    const a = c('a', 'a1', 600, 90, 5)
    const b = c('b', 'b1', 705, 60, 5) // 11:45
    const r = optimize([a, b], BUFFER)
    expect(r.chosen.length).toBe(1)
  })

  it('takes both when the buffer is satisfied exactly', () => {
    // a: 10:00-11:30, b: 12:00 → exactly 30 min gap → OK.
    const a = c('a', 'a1', 600, 90, 5)
    const b = c('b', 'b1', 720, 60, 5) // 12:00
    const r = optimize([a, b], BUFFER)
    expect(r.chosen.map((x) => x.showId).sort()).toEqual(['a', 'b'])
    expect(r.totalWeight).toBe(10)
  })

  it('never schedules two performances of the same show', () => {
    // Two non-overlapping performances of show a.
    const a1 = c('a', 'a1', 600, 60, 5)
    const a2 = c('a', 'a2', 800, 60, 5)
    const r = optimize([a1, a2], BUFFER)
    expect(r.chosen.length).toBe(1)
    expect(r.totalWeight).toBe(5)
  })

  it('prefers the higher total weight over the higher count', () => {
    // One heavy show conflicts with two light shows whose sum is smaller.
    const heavy = c('h', 'h1', 600, 180, 10) // 10:00-13:00
    const l1 = c('x', 'x1', 600, 60, 4) // conflicts with heavy
    const l2 = c('y', 'y1', 720, 60, 4) // conflicts with heavy
    const r = optimize([heavy, l1, l2], BUFFER)
    expect(r.chosen.map((x) => x.showId)).toEqual(['h'])
    expect(r.totalWeight).toBe(10)
  })

  it('picks the alternative performance that unlocks a better schedule', () => {
    // Show a has two performances; taking the later one frees the morning for b and c.
    const aEarly = c('a', 'aE', 600, 120, 3) // 10:00-12:00 (blocks b, c)
    const aLate = c('a', 'aL', 1200, 120, 3) // 20:00-22:00
    const b = c('b', 'b1', 600, 60, 3) // 10:00-11:00
    const cc = c('c', 'c1', 720, 60, 3) // 12:00-13:00
    const r = optimize([aEarly, aLate, b, cc], BUFFER)
    expect(r.chosen.map((x) => x.showId).sort()).toEqual(['a', 'b', 'c'])
    expect(r.totalWeight).toBe(9)
    // And it must have used the late performance of a.
    expect(r.chosen.find((x) => x.showId === 'a')!.perfId).toBe('aL')
  })

  it('applies no buffer around a break (isBreak)', () => {
    // Show a ends 11:30, break 11:30–12:30 (0 gap ok), show b 12:30 (0 gap ok).
    const a = c('a', 'a1', 600, 90, 5) // 10:00–11:30
    const brk: Candidate = { showId: 'lunch', perfId: 'l1', start: 690 * 60_000, end: 750 * 60_000, weight: 1000, isBreak: true }
    const b = c('b', 'b1', 750, 60, 5) // 12:30–13:30
    const r = optimize([a, brk, b], BUFFER)
    expect(r.chosen.map((x) => x.showId)).toEqual(['a', 'lunch', 'b'])
  })

  it('still enforces the buffer between two shows even when a break exists elsewhere', () => {
    // Two shows 15 min apart cannot both be taken; a break earlier is irrelevant.
    const brk: Candidate = { showId: 'lunch', perfId: 'l1', start: 720 * 60_000, end: 780 * 60_000, weight: 1000, isBreak: true }
    const a = c('a', 'a1', 900, 90, 5) // 15:00–16:30
    const b = c('b', 'b1', 1005, 60, 5) // 16:45 → only 15 min after a
    const r = optimize([brk, a, b], BUFFER)
    const shows = r.chosen.filter((x) => x.showId !== 'lunch')
    expect(shows.length).toBe(1)
  })

  it('chosen items are sorted by start time', () => {
    const r = optimize(
      [c('b', 'b1', 900, 60, 1), c('a', 'a1', 600, 60, 1)],
      BUFFER,
    )
    expect(r.chosen.map((x) => x.showId)).toEqual(['a', 'b'])
  })
})
