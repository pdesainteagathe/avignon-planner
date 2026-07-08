import { describe, it, expect } from 'vitest'
import { plan } from './planning'
import { toPlainText, toICS } from './export'
import { sampleCatalog } from '../data/sampleCatalog'
import { DEFAULT_SETTINGS, type PresenceWindow, type WishItem } from '../types'

const windows: PresenceWindow[] = [{ id: 'w', date: '2026-07-08', start: '10:00', end: '23:59' }]
const wishlist: WishItem[] = sampleCatalog.shows.slice(0, 6).map((s) => ({ showId: s.id }))
const result = plan(sampleCatalog, wishlist, windows, DEFAULT_SETTINGS)

describe('export', () => {
  it('plain text lists the day and each scheduled show', () => {
    const txt = toPlainText(result)
    expect(txt).toContain("Mon planning")
    // Every scheduled show title appears in the text.
    for (const it of result.scheduled) expect(txt).toContain(it.show.title)
  })

  it('ICS is a valid calendar with one VEVENT per show + break', () => {
    const ics = toICS(result)
    expect(ics).toMatch(/^BEGIN:VCALENDAR/)
    expect(ics.trimEnd()).toMatch(/END:VCALENDAR$/)
    const events = (ics.match(/BEGIN:VEVENT/g) || []).length
    expect(events).toBe(result.scheduled.length + result.breaks.length)
    // DTSTART is a floating local timestamp: YYYYMMDDTHHMMSS.
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}/)
  })
})
