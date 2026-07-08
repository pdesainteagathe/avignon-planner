import type { PresenceWindow } from '../types'

interface Props {
  windows: PresenceWindow[]
  onChange: (windows: PresenceWindow[]) => void
}

function newId(): string {
  return crypto.randomUUID()
}

const FESTIVAL_FIRST = '2026-07-04'
const FESTIVAL_LAST = '2026-07-25'

/** Next calendar day after an ISO date, clamped to the festival's last day. */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const next = `${y}-${m}-${day}`
  return next > FESTIVAL_LAST ? FESTIVAL_LAST : next
}

// Tell password managers (Dashlane / 1Password / LastPass) to leave these date &
// time fields alone — no autofill icons on them.
const noPwManager = {
  autoComplete: 'off',
  'data-form-type': 'other',
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
} as const

export function PresenceEditor({ windows, onChange }: Props) {
  const update = (id: string, patch: Partial<PresenceWindow>) =>
    onChange(windows.map((w) => (w.id === id ? { ...w, ...patch } : w)))

  const add = () => {
    const last = windows[windows.length - 1]
    onChange([
      ...windows,
      {
        id: newId(),
        // Propose the day after the last one, with its same time range.
        date: last ? nextDay(last.date) : '2026-07-08',
        start: last?.start ?? '10:00',
        end: last?.end ?? '23:59',
      },
    ])
  }

  const remove = (id: string) => onChange(windows.filter((w) => w.id !== id))

  return (
    <section className="card">
      <h2>1 · Mes créneaux de présence</h2>
      <p className="hint">
        Ajoute chaque jour où tu es à Avignon, avec l’heure d’arrivée et de départ.
      </p>
      {windows.length === 0 && (
        <p className="empty">Aucun créneau pour l’instant.</p>
      )}
      <div className="window-list">
        {windows.map((w) => (
          <div className="window-row" key={w.id}>
            <input
              type="date"
              value={w.date}
              min={FESTIVAL_FIRST}
              max={FESTIVAL_LAST}
              onChange={(e) => update(w.id, { date: e.target.value })}
              {...noPwManager}
            />
            <span className="from">de</span>
            <input
              type="time"
              value={w.start}
              onChange={(e) => update(w.id, { start: e.target.value })}
              {...noPwManager}
            />
            <span className="to">à</span>
            <input
              type="time"
              value={w.end}
              onChange={(e) => update(w.id, { end: e.target.value })}
              {...noPwManager}
            />
            <button className="icon-btn" title="Supprimer" onClick={() => remove(w.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button className="add-btn" onClick={add}>
        + Ajouter un jour
      </button>
    </section>
  )
}
