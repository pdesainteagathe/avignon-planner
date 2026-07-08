import type { Catalog, WishItem } from '../types'

interface Props {
  catalog: Catalog
  wishlist: WishItem[]
  onChange: (wishlist: WishItem[]) => void
}

export function Wishlist({ catalog, wishlist, onChange }: Props) {
  const byId = new Map(catalog.shows.map((s) => [s.id, s]))

  const move = (from: number, to: number) => {
    if (to < 0 || to >= wishlist.length) return
    const next = [...wishlist]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }
  const toggle = (showId: string) =>
    onChange(
      wishlist.map((w) => (w.showId === showId ? { ...w, excluded: !w.excluded } : w)),
    )
  const remove = (showId: string) =>
    onChange(wishlist.filter((w) => w.showId !== showId))

  return (
    <section className="card">
      <h2>3 · Ordre de préférence</h2>
      <p className="hint">
        Du plus au moins important. L’optimiseur maximise ta satisfaction en
        privilégiant le haut de la liste.
      </p>
      {wishlist.length === 0 && (
        <p className="empty">Ajoute des pièces depuis le catalogue.</p>
      )}
      <ol className="wishlist">
        {wishlist.map((w, i) => {
          const show = byId.get(w.showId)
          if (!show) return null
          return (
            <li key={w.showId} className={`wish-item${w.excluded ? ' excluded' : ''}`}>
              <span className="rank">{i + 1}</span>
              <div className="wi-main">
                <span className="wi-title">{show.title}</span>
                <span className="wi-meta">{show.venue}</span>
              </div>
              <div className="wi-actions">
                <button className="icon-btn" title="Monter" disabled={i === 0} onClick={() => move(i, i - 1)}>
                  ▲
                </button>
                <button
                  className="icon-btn"
                  title="Descendre"
                  disabled={i === wishlist.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  ▼
                </button>
                <button
                  className="icon-btn"
                  title={w.excluded ? 'Réactiver' : 'Désactiver'}
                  onClick={() => toggle(w.showId)}
                >
                  {w.excluded ? '◻' : '☑'}
                </button>
                <button className="icon-btn" title="Retirer" onClick={() => remove(w.showId)}>
                  ✕
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
