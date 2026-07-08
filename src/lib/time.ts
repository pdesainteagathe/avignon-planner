// Time helpers. Internally we reason in epoch milliseconds; the UI works with
// ISO local strings ("2026-07-10T14:30") and "HH:MM".

/** Parse an ISO local datetime string into epoch ms (interpreted as local time). */
export function isoToMs(iso: string): number {
  // `new Date("2026-07-10T14:30")` is parsed as local time by JS engines.
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) throw new Error(`Invalid datetime: ${iso}`)
  return ms
}

/** Combine an ISO date ("2026-07-10") and "HH:MM" into epoch ms (local). */
export function dateTimeToMs(date: string, hhmm: string): number {
  return isoToMs(`${date}T${hhmm}`)
}

export function addMinutes(ms: number, minutes: number): number {
  return ms + minutes * 60_000
}

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const MONTHS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

export function formatDay(ms: number): string {
  const d = new Date(ms)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function formatTime(ms: number): string {
  const d = new Date(ms)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export function formatRange(startMs: number, endMs: number): string {
  return `${formatTime(startMs)} – ${formatTime(endMs)}`
}

/** Format a scrape timestamp (UTC ISO "2026-07-08T12:54", no tz) as local time. */
export function formatUpdated(iso?: string): string | null {
  if (!iso) return null
  const ms = Date.parse(iso.length === 16 ? `${iso}:00Z` : iso)
  if (Number.isNaN(ms)) return null
  return `${formatDay(ms)} à ${formatTime(ms)}`
}

/** Next scheduled auto-refresh (cron every N hours UTC), as a local label. */
export function nextRefreshLabel(everyHoursUtc = 6): string {
  const now = Date.now()
  const d = new Date(now)
  d.setUTCMinutes(0, 0, 0)
  while (d.getTime() <= now || d.getUTCHours() % everyHoursUtc !== 0) {
    d.setUTCHours(d.getUTCHours() + 1)
  }
  const ms = d.getTime()
  const sameDay = new Date(ms).getDate() === new Date(now).getDate()
  return sameDay ? formatTime(ms) : `${formatDay(ms)} ${formatTime(ms)}`
}

/** ISO date part ("2026-07-10") for grouping, in local time. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}
