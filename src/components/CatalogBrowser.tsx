import { useMemo, useState } from 'react'
import type { Catalog, WishItem } from '../types'

interface Props {
  catalog: Catalog
  wishlist: WishItem[]
  onAdd: (showId: string) => void
}

const PAGE = 60

/** Lowercase + strip accents so "gemeaux" matches "GÉMEAUX", "chene" → "CHÊNE". */
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

export function CatalogBrowser({ catalog, wishlist, onAdd }: Props) {
  const [q, setQ] = useState('')
  const inWishlist = useMemo(
    () => new Set(wishlist.map((w) => w.showId)),
    [wishlist],
  )

  // Pre-compute a normalized haystack per show (title + venue + genre + company)
  // once, so accent-insensitive filtering stays fast over ~1900 shows.
  const index = useMemo(
    () =>
      catalog.shows.map((s) => ({
        show: s,
        hay: norm([s.title, s.company, s.genre, s.venue].filter(Boolean).join(' ')),
      })),
    [catalog],
  )

  const filtered = useMemo(() => {
    const needle = norm(q.trim())
    if (!needle) return catalog.shows
    return index.filter((e) => e.hay.includes(needle)).map((e) => e.show)
  }, [index, q, catalog])

  const shown = filtered.slice(0, PAGE)

  return (
    <section className="card">
      <h2>Choisir les pièces</h2>
      <p className="hint">
        Cherche puis ajoute les spectacles qui t’intéressent. Tu les classeras
        par préférence à l’étape 3.
      </p>
      <input
        className="search"
        type="search"
        placeholder="Rechercher un titre, un lieu, un genre…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className="count">
        {filtered.length} spectacle{filtered.length > 1 ? 's' : ''}
        {filtered.length > PAGE ? ` (${PAGE} affichés — affine la recherche)` : ''}
      </p>
      <ul className="catalog-list">
        {shown.map((s) => {
          const added = inWishlist.has(s.id)
          return (
            <li key={s.id} className="catalog-item">
              <div className="ci-main">
                <span className="ci-title">{s.title}</span>
                <span className="ci-meta">
                  {s.venue} · {s.durationMin} min
                  {s.genre ? ` · ${s.genre}` : ''}
                </span>
                <span className="ci-times">{distinctTimes(s.performances.map((p) => p.start))}</span>
              </div>
              <button
                className="add-btn small"
                disabled={added}
                onClick={() => onAdd(s.id)}
              >
                {added ? '✓ Ajouté' : '+ Ajouter'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
