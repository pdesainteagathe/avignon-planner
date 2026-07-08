import { useState } from 'react'
import type { PlanResult, UnscheduledReason } from '../lib/planning'
import { formatDay, formatRange, formatTime } from '../lib/time'
import { isFillingUp, seatLabel, seatStatus } from '../lib/seats'
import { toICS, toPlainText } from '../lib/export'
import { REFRESH_URL } from '../config'

function ExportButtons({ result }: { result: PlanResult }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const text = toPlainText(result)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* ignore */
      }
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const downloadIcs = () => {
    const blob = new Blob([toICS(result)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'planning-avignon.ics'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="export-actions">
      <button className="add-btn small" onClick={copy} title="Copier le planning en texte">
        {copied ? '✓ Copié' : '📋 Copier'}
      </button>
      <button className="add-btn small" onClick={downloadIcs} title="Télécharger pour ton agenda">
        📅 .ics
      </button>
    </div>
  )
}

const REASON_LABEL: Record<UnscheduledReason, string> = {
  excluded: 'Désactivée',
  'sold-out': 'Vente clôturée / indisponible sur toutes les dates',
  quota: 'Quota Ticket’Off atteint (peut rester dispo au théâtre)',
  'outside-windows': 'Aucune représentation dans tes créneaux',
  'no-performances': 'Pas de représentation au programme',
  conflict: 'Conflit d’horaire — écartée au profit de choix mieux classés',
}

const REASON_CLASS: Record<UnscheduledReason, string> = {
  excluded: 'muted',
  'sold-out': 'warn',
  quota: 'info',
  'outside-windows': 'warn',
  'no-performances': 'warn',
  conflict: 'info',
}

interface Props {
  result: PlanResult | null
  updatedAt?: string | null
  booked?: Record<string, boolean>
  onToggleBooked?: (perfId: string) => void
}

function Freshness({ updatedAt }: { updatedAt?: string | null }) {
  return (
    <p className="freshness">
      {updatedAt ? (
        <>
          Disponibilités des places à jour au <strong>{updatedAt}</strong>
        </>
      ) : (
        'Disponibilités : catalogue de démonstration'
      )}
      {' · '}
      <a href={REFRESH_URL} target="_blank" rel="noreferrer" title="Relance un scrape complet puis republie (~7 min)">
        🔄 Rafraîchir
      </a>
    </p>
  )
}

export function PlanningView({ result, updatedAt, booked = {}, onToggleBooked }: Props) {
  if (!result) {
    return (
      <section className="card planning">
        <h2>Planning proposé</h2>
        <Freshness updatedAt={updatedAt} />
        <p className="empty">
          Renseigne tes créneaux et au moins une pièce pour générer un planning.
        </p>
      </section>
    )
  }

  const pct = result.maxWeight > 0 ? Math.round((result.totalWeight / result.maxWeight) * 100) : 0
  const scheduledCount = result.scheduled.length
  const bookedCount = result.scheduled.filter((it) => booked[it.perfId]).length
  const hasPlan = scheduledCount > 0 || result.breaks.length > 0

  return (
    <section className="card planning">
      <div className="card-head">
        <h2>Planning proposé</h2>
        {hasPlan && <ExportButtons result={result} />}
      </div>
      <Freshness updatedAt={updatedAt} />

      <div className="score">
        <div className="score-head">
          <strong>
            {scheduledCount} pièce{scheduledCount > 1 ? 's' : ''} casée
            {scheduledCount > 1 ? 's' : ''}
          </strong>
          <span>
            {bookedCount > 0 && (
              <span className="booked-count">✓ {bookedCount} réservée{bookedCount > 1 ? 's' : ''} · </span>
            )}
            Satisfaction {pct}%
          </span>
        </div>
        <div className="score-bar">
          <div className="score-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {result.approximate && (
        <p className="banner warn">
          ⚠️ Beaucoup de combinaisons : résultat quasi-optimal (pas garanti 100 % optimal).
        </p>
      )}

      {(() => {
        const filling = result.scheduled.filter((it) => isFillingUp(it.seatsLeft))
        if (filling.length === 0) return null
        return (
          <div className="banner urgent">
            🎟️ <strong>Réserve vite</strong> — {filling.length} pièce
            {filling.length > 1 ? 's se remplissent' : ' se remplit'} :
            <ul className="urgent-list">
              {filling.map((it) => (
                <li key={it.perfId}>
                  <span>{it.show.title}</span>
                  <span className="seats critical">{it.seatsLeft} places</span>
                  <span className="urgent-when">
                    {formatDay(it.start)} {formatTime(it.start)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      })()}

      {result.days.length === 0 && (
        <p className="empty">Aucune pièce n’a pu être planifiée pour l’instant.</p>
      )}

      <div className="days">
        {result.days.map((day) => (
          <div className="day-col" key={day.dayKey}>
            <h3>{formatDay(day.entries[0].start)}</h3>
            <ul className="slots">
              {day.entries.map((entry) => {
                if (entry.kind === 'break') {
                  return (
                    <li className="slot break" key={`b-${entry.start}`}>
                      <span className="slot-time">{formatRange(entry.start, entry.end)}</span>
                      <span className="slot-title">🍽️ {entry.label}</span>
                      <span className="slot-venue">temps libre réservé</span>
                    </li>
                  )
                }
                const isBooked = !!booked[entry.perfId]
                return (
                  <li className={`slot${isBooked ? ' booked' : ''}`} key={entry.perfId}>
                    <span className="slot-time">{formatRange(entry.start, entry.end)}</span>
                    <span className="slot-title">
                      <span className="mini-rank">#{entry.rank + 1}</span> {entry.show.title}
                      {entry.status === 'quota' && entry.theatreStatus === 'onSale' ? (
                        <span className="seats theatre" title="Quota Ticket'Off atteint, mais réservable directement sur la billetterie du théâtre">
                          🎭 dispo au théâtre
                        </span>
                      ) : entry.status === 'quota' ? (
                        <span className="seats quota" title="Quota en ligne Ticket'Off atteint — peut rester dispo directement au théâtre">
                          🎫 quota Ticket'Off
                        </span>
                      ) : (
                        seatLabel(entry.seatsLeft) && (
                          <span className={`seats ${seatStatus(entry.seatsLeft)}`}>
                            {seatLabel(entry.seatsLeft)}
                          </span>
                        )
                      )}
                    </span>
                    <span className="slot-venue">
                      {entry.show.venue}
                      {entry.walkFromPrevMin != null && (
                        <span className="walk"> · 🚶 {entry.walkFromPrevMin} min</span>
                      )}
                    </span>
                    <span className="slot-actions">
                      {entry.show.ticketUrl && !isBooked && (
                        <a className="book-link" href={entry.show.ticketUrl} target="_blank" rel="noreferrer">
                          🎟 Réserver
                        </a>
                      )}
                      {onToggleBooked && (
                        <button
                          className={`book-btn${isBooked ? ' done' : ''}`}
                          onClick={() => onToggleBooked(entry.perfId)}
                        >
                          {isBooked ? '✓ Réservé — annuler' : 'J’ai réservé'}
                        </button>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {result.unscheduled.length > 0 && (
        <div className="unscheduled">
          <h3>Non planifiées</h3>
          <ul>
            {result.unscheduled.map((u) => (
              <li key={u.show.id} className={REASON_CLASS[u.reason]}>
                <span className="us-title">{u.show.title}</span>
                <span className="us-reason">{REASON_LABEL[u.reason]}</span>
                {u.show.ticketUrl && (
                  <a className="us-link" href={u.show.ticketUrl} target="_blank" rel="noreferrer">
                    voir
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
