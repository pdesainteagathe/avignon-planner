import { useEffect, useMemo, useRef, useState } from 'react'
import type { Catalog, PlannerSettings, PresenceWindow, WeightMode, WishItem } from './types'
import { sampleCatalog } from './data/sampleCatalog'
import { loadState, saveState } from './lib/storage'
import { plan, type PlanResult } from './lib/planning'
import type { VenueCoords } from './lib/travel'
import { formatUpdated } from './lib/time'
import { PresenceEditor } from './components/PresenceEditor'
import { CatalogBrowser } from './components/CatalogBrowser'
import { Wishlist } from './components/Wishlist'
import { PlanningView } from './components/PlanningView'

export default function App() {
  const initial = loadState()
  const [catalog, setCatalog] = useState<Catalog>(sampleCatalog)
  const [windows, setWindows] = useState<PresenceWindow[]>(initial.windows)
  const [wishlist, setWishlist] = useState<WishItem[]>(initial.wishlist)
  const [settings, setSettings] = useState<PlannerSettings>(initial.settings)
  const [favorites, setFavorites] = useState<string[]>([])
  const [venues, setVenues] = useState<VenueCoords>({})
  const seededRef = useRef(false)

  // Load the real scraped catalog if present (public/catalog.json); else keep sample.
  useEffect(() => {
    fetch('catalog.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.shows) && data.shows.length > 0) {
          setCatalog(data as Catalog)
        }
      })
      .catch(() => {
        /* keep sample */
      })
  }, [])

  // Load the curated favourites list (public/favorites.json).
  useEffect(() => {
    fetch('favorites.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.showIds)) setFavorites(data.showIds)
      })
      .catch(() => {})
  }, [])

  // Load venue coordinates for distance-aware buffers (public/venues.json).
  useEffect(() => {
    fetch('venues.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.venues) setVenues(data.venues)
      })
      .catch(() => {})
  }, [])

  const loadFavorites = () =>
    setWishlist(favorites.map((showId) => ({ showId })))

  // Auto-seed the wishlist from favourites when the stored one has no show that
  // still exists in the current catalog (e.g. leftover demo entries). Runs once.
  useEffect(() => {
    if (seededRef.current || favorites.length === 0 || catalog.shows.length === 0) return
    const catalogIds = new Set(catalog.shows.map((s) => s.id))
    const validCount = wishlist.filter((w) => catalogIds.has(w.showId)).length
    if (validCount === 0) {
      seededRef.current = true
      setWishlist(favorites.map((showId) => ({ showId })))
    }
  }, [favorites, catalog, wishlist])

  useEffect(() => {
    saveState({ windows, wishlist, settings })
  }, [windows, wishlist, settings])

  const result: PlanResult | null = useMemo(() => {
    if (windows.length === 0 || wishlist.length === 0) return null
    return plan(catalog, wishlist, windows, settings, venues)
  }, [catalog, wishlist, windows, settings, venues])

  const addToWishlist = (showId: string) => {
    setWishlist((w) => (w.some((x) => x.showId === showId) ? w : [...w, { showId }]))
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>🎭 Planificateur — Festival Off d’Avignon</h1>
          <p className="subtitle">
            Ton planning de réservation optimal : un maximum de pièces qui te
            plaisent, 30 min de battement, sans conflit d’horaire.
          </p>
        </div>
        <div className="catalog-badge" title={catalog.source}>
          {catalog.shows.length} spectacles · {catalog.source.includes('démonstration') ? 'démo' : 'catalogue'}
        </div>
      </header>

      <div className="layout">
        <div className="col-config">
          <PresenceEditor windows={windows} onChange={setWindows} />
          <CatalogBrowser catalog={catalog} wishlist={wishlist} onAdd={addToWishlist} />
          <Wishlist
            catalog={catalog}
            wishlist={wishlist}
            onChange={setWishlist}
            favoritesCount={favorites.length}
            onLoadFavorites={loadFavorites}
          />
          <Settings settings={settings} onChange={setSettings} />
        </div>
        <div className="col-planning">
          <PlanningView result={result} updatedAt={formatUpdated(catalog.generatedAt)} />
        </div>
      </div>

      <footer className="app-footer">
        Ta sélection est stockée dans ton navigateur · Festival Off 2026 (4–25 juillet)
      </footer>
    </div>
  )
}

function Settings({
  settings,
  onChange,
}: {
  settings: PlannerSettings
  onChange: (s: PlannerSettings) => void
}) {
  return (
    <section className="card">
      <h2>4 · Réglages</h2>
      <div className="setting-row">
        <label>
          Stratégie
          <select
            value={settings.weightMode}
            onChange={(e) => onChange({ ...settings, weightMode: e.target.value as WeightMode })}
          >
            <option value="balanced">Équilibrée (voir un max de pièces)</option>
            <option value="top-priority">Priorité à mes premiers choix</option>
          </select>
        </label>
      </div>
      <div className="setting-row">
        <span className="setting-label">Battements entre pièces</span>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.travel.enabled}
            onChange={(e) =>
              onChange({ ...settings, travel: { ...settings.travel, enabled: e.target.checked } })
            }
          />
          Selon le temps de marche entre théâtres (min {settings.travel.minBufferMin} min)
        </label>
        {!settings.travel.enabled && (
          <label>
            <span className="setting-label" style={{ marginTop: 8 }}>
              Battement fixe
            </span>
            <select
              value={settings.bufferMin}
              onChange={(e) => onChange({ ...settings, bufferMin: Number(e.target.value) })}
            >
              {[15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="setting-row">
        <span className="setting-label">Disponibilités</span>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.onlineOnly}
            onChange={(e) => onChange({ ...settings, onlineOnly: e.target.checked })}
          />
          Exclure les séances « quota atteint · guichet » (garder seulement le réservable en ligne)
        </label>
      </div>
      <div className="setting-row">
        <span className="setting-label">Pauses réservées</span>
        {settings.meals.map((meal, i) => (
          <label key={meal.id} className="check-row">
            <input
              type="checkbox"
              checked={meal.enabled}
              onChange={(e) => {
                const meals = settings.meals.map((m, j) =>
                  j === i ? { ...m, enabled: e.target.checked } : m,
                )
                onChange({ ...settings, meals })
              }}
            />
            {meal.label} — {meal.durationMin} min libres entre {meal.windowStart} et{' '}
            {meal.windowEnd}
          </label>
        ))}
      </div>
    </section>
  )
}
