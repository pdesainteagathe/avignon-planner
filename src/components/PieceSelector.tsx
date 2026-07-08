import { useMemo, useState } from 'react'
import type { Catalog, WishItem } from '../types'

interface Props {
  catalog: Catalog
  wishlist: WishItem[]
  onChange: (wishlist: WishItem[]) => void
  favoritesCount?: number
  onLoadFavorites?: () => void
}

const MAX_RESULTS = 40

/** Lowercase + strip accents so "gemeaux" matches "GÉMEAUX". */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function distinctTimes(iso: string[]): string {
  const times = new Set(iso.map((s) => s.slice(11, 16)))
  return [...times].sort().join(' · ')
}

export function PieceSelector({
  catalog,
  wishlist,
  onChange,
  favoritesCount = 0,
  onLoadFavorites,
}: Props) {
  const [q, setQ] = useState('')
  const byId = useMemo(() => new Map(catalog.shows.map((s) => [s.id, s])), [catalog])
  const inWishlist = useMemo(() => new Set(wishlist.map((w) => w.showId)), [wishlist])

  const index = useMemo(
    () =>
      catalog.shows.map((s) => ({
        show: s,
        hay: norm([s.title, s.company, s.genre, s.venue].filter(Boolean).join(' ')),
      })),
    [catalog],
  )

  const results = useMemo(() => {
    const needle = norm(q.trim())
    if (!needle) return []
    return index.filter((e) => e.hay.includes(needle)).map((e) => e.show)
  }, [index, q])

  const add = (showId: string) =>
    onChange(wishlist.some((w) => w.showId === showId) ? wishlist : [...wishlist, { showId }])

  const move = (from: number, to: number) => {
    if (to < 0 || to >= wishlist.length) return
    const next = [...wishlist]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }
  const toggle = (showId: string) =>
    onChange(wishlist.map((w) => (w.showId === showId ? { ...w, excluded: !w.excluded } : w)))
  const remove = (showId: string) => onChange(wishlist.filter((w) => w.showId !== showId))

  const activeCount = wishlist.filter((w) => !w.excluded).length

  return (
    <section className="card">
      <div className="card-head">
        <h2>Choisir les pièces</h2>
        {favoritesCount > 0 && onLoadFavorites && (
          <button
            className="add-btn small"
            title="Charge un exemple de sélection (que tu peux ensuite modifier)"
            onClick={() => {
              if (
                wishlist.length === 0 ||
                confirm(`Remplacer la liste actuelle par l’exemple de sélection (${favoritesCount} pièces) ?`)
              ) {
                onLoadFavorites()
              }
            }}
          >
            ★ Exemple de sélection ({favoritesCount})
          </button>
        )}
      </div>
      <p className="hint">
        Cherche une pièce (titre, lieu, genre) pour l’ajouter, puis classe ta
        sélection par préférence — du plus au moins important.
      </p>

      <input
        className="search"
        type="search"
        placeholder="Rechercher un titre, un lieu, un genre…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {q.trim() && (
        <>
          <p className="count">
            {results.length} résultat{results.length > 1 ? 's' : ''}
            {results.length > MAX_RESULTS ? ` (${MAX_RESULTS} affichés — affine)` : ''}
          </p>
          <ul className="catalog-list results">
            {results.slice(0, MAX_RESULTS).map((s) => {
              const added = inWishlist.has(s.id)
              return (
                <li key={s.id} className="catalog-item">
                  <div className="ci-main">
                    <span className="ci-title">{s.title}</span>
                    <span className="ci-meta">
                      {s.venue} · {s.durationMin} min{s.genre ? ` · ${s.genre}` : ''}
                    </span>
                    <span className="ci-times">{distinctTimes(s.performances.map((p) => p.start))}</span>
                  </div>
                  <button className="add-btn small" disabled={added} onClick={() => add(s.id)}>
                    {added ? '✓ Ajouté' : '+ Ajouter'}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <h3 className="wishlist-title">
        Ma sélection {activeCount > 0 && <span className="muted-count">· {activeCount}</span>}
      </h3>
      {wishlist.length === 0 ? (
        <p className="empty">
          Aucune pièce pour l’instant — cherche ci-dessus, ou charge l’exemple de sélection.
        </p>
      ) : (
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
      )}
    </section>
  )
}
