import { describe, it, expect } from 'vitest'
import { seatStatus, seatLabel, isFillingUp } from './seats'

describe('seat status', () => {
  it('treats 0 or missing as unknown (venue does not publish counts)', () => {
    expect(seatStatus(0)).toBe('unknown')
    expect(seatStatus(undefined)).toBe('unknown')
    expect(seatLabel(0)).toBeNull()
    expect(isFillingUp(0)).toBe(false)
  })

  it('flags low and critical thresholds', () => {
    expect(seatStatus(3)).toBe('critical')
    expect(seatStatus(12)).toBe('low')
    expect(seatStatus(80)).toBe('plenty')
    expect(seatLabel(3)).toMatch(/plus que 3/)
    expect(isFillingUp(12)).toBe(true)
    expect(isFillingUp(80)).toBe(false)
  })
})
