import type { PlanResult, UnscheduledReason } from './planning'
import { formatDay, formatRange } from './time'

const REASON_SHORT: Record<UnscheduledReason, string> = {
  excluded: 'désactivée',
  'sold-out': 'vente clôturée',
  quota: 'quota en ligne atteint',
  'outside-windows': 'hors créneaux',
  'no-performances': 'pas de représentation',
  conflict: 'conflit horaire',
}

/** Human-friendly plain text, ready to paste into a message or notes. */
export function toPlainText(result: PlanResult): string {
  const lines: string[] = ["🎭 Mon planning — Festival Off d'Avignon", '']

  for (const day of result.days) {
    lines.push(formatDay(day.entries[0].start))
    for (const e of day.entries) {
      if (e.kind === 'break') {
        const icon = /d[îi]ner/i.test(e.label) ? '🍷' : '🍽️'
        lines.push(`  ${formatRange(e.start, e.end)}   ${icon} ${e.label} (temps libre)`)
      } else {
        const tag =
          e.status === 'quota'
            ? "  🎫 quota Ticket'Off atteint (voir au théâtre)"
            : e.seatsLeft && e.seatsLeft > 0 && e.seatsLeft <= 15
              ? `  ⚠️ ${e.seatsLeft} places`
              : ''
        lines.push(`  ${formatRange(e.start, e.end)}   ${e.show.title} — ${e.show.venue}${tag}`)
      }
    }
    lines.push('')
  }

  const notPlanned = result.unscheduled.filter((u) => u.reason !== 'excluded')
  if (notPlanned.length) {
    lines.push('Non planifiées :')
    for (const u of notPlanned) lines.push(`  · ${u.show.title} (${REASON_SHORT[u.reason]})`)
  }

  return lines.join('\n').trim() + '\n'
}

function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(
    d.getMinutes(),
  )}00`
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/**
 * iCalendar file. Times are floating local time (no timezone marker), which
 * calendar apps interpret in the device's local zone — correct for a trip where
 * you're on-site in the same zone as the festival.
 */
export function toICS(result: PlanResult): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//avignon-planner//FR', 'CALSCALE:GREGORIAN']
  const event = (uid: string, start: number, end: number, summary: string, location?: string, desc?: string) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp(start)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(summary)}`)
    if (location) lines.push(`LOCATION:${esc(location)}`)
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`)
    lines.push('END:VEVENT')
  }
  for (const it of result.scheduled) {
    const note =
      it.status === 'quota'
        ? " · quota Ticket'Off atteint (voir au théâtre)"
        : it.seatsLeft && it.seatsLeft > 0
          ? ` · ${it.seatsLeft} places restantes`
          : ''
    event(`show-${it.perfId}@avignon-planner`, it.start, it.end, it.show.title, it.show.venue, `Choix #${it.rank + 1}${note}`)
  }
  for (const b of result.breaks) {
    event(`break-${b.start}@avignon-planner`, b.start, b.end, `🍽️ ${b.label} (temps libre)`)
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
