import type { PlanResult, UnscheduledReason } from '../lib/planning'
import { formatDay, formatRange } from '../lib/time'

const REASON_LABEL: Record<UnscheduledReason, string> = {
  excluded: 'Désactivée',
  'sold-out': 'Complet sur toutes les dates',
  'outside-windows': 'Aucune représentation dans tes créneaux',
  'no-performances': 'Pas de représentation au programme',
  conflict: 'Conflit d’horaire — écartée au profit de choix mieux classés',
}

const REASON_CLASS: Record<UnscheduledReason, string> = {
  excluded: 'muted',
  'sold-out': 'warn',
  'outside-windows': 'warn',
  'no-performances': 'warn',
  conflict: 'info',
}

interface Props {
  result: PlanResult | null
}

export function PlanningView({ result }: Props) {
  if (!result) {
    return (
      <section className="card planning">
        <h2>Planning proposé</h2>
        <p className="empty">
          Renseigne tes créneaux et au moins une pièce pour générer un planning.
        </p>
      </section>
    )
  }

  const pct = result.maxWeight > 0 ? Math.round((result.totalWeight / result.maxWeight) * 100) : 0
  const scheduledCount = result.scheduled.length

  return (
    <section className="card planning">
      <h2>Planning proposé</h2>

      <div className="score">
        <div className="score-head">
          <strong>
            {scheduledCount} pièce{scheduledCount > 1 ? 's' : ''} casée
            {scheduledCount > 1 ? 's' : ''}
          </strong>
          <span>Satisfaction {pct}%</span>
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

      {result.days.length === 0 && (
        <p className="empty">Aucune pièce n’a pu être planifiée pour l’instant.</p>
      )}

      <div className="days">
        {result.days.map((day) => (
          <div className="day-col" key={day.dayKey}>
            <h3>{formatDay(day.items[0].start)}</h3>
            <ul className="slots">
              {day.items.map((it) => (
                <li className="slot" key={it.perfId}>
                  <span className="slot-time">{formatRange(it.start, it.end)}</span>
                  <span className="slot-title">
                    <span className="mini-rank">#{it.rank + 1}</span> {it.show.title}
                  </span>
                  <span className="slot-venue">{it.show.venue}</span>
                </li>
              ))}
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
