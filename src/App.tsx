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
import { Stepper } from './components/Stepper'

const STEP_LABELS = ['Mes créneaux', 'Les pièces', 'Les options', 'Planning']

export default function App() {
  const initial = loadState()
  const [catalog, setCatalog] = useState<Catalog>(sampleCatalog)
  const [windows, setWindows] = useState<PresenceWindow[]>(initial.windows)
  const [wishlist, setWishlist] = useState<WishItem[]>(initial.wishlist)
  const [settings, setSettings] = useState<PlannerSettings>(initial.settings)
  const [favorites, setFavorites] = useState<string[]>([])
  const [venues, setVenues] = useState<VenueCoords>({})
  const [booked, setBooked] = useState<Record<string, boolean>>(initial.booked)
  const [step, setStep] = useState(
    initial.windows.length > 0 && initial.wishlist.length > 0 ? 3 : 0,
  )
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
    saveState({ windows, wishlist, settings, booked })
  }, [windows, wishlist, settings, booked])

  const toggleBooked = (perfId: string) =>
    setBooked((b) => ({ ...b, [perfId]: !b[perfId] }))

  const result: PlanResult | null = useMemo(() => {
    if (windows.length === 0 || wishlist.length === 0) return null
    return plan(catalog, wishlist, windows, settings, venues)
  }, [catalog, wishlist, windows, settings, venues])

  const addToWishlist = (showId: string) => {
    setWishlist((w) => (w.some((x) => x.showId === showId) ? w : [...w, { showId }]))
  }

  const wishlistCount = wishlist.filter((w) => !w.excluded).length

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>🎭 Planificateur — Festival Off d’Avignon</h1>
          <p className="subtitle">
            Ton planning de réservation optimal : un maximum de pièces qui te
            plaisent, battements de marche, sans conflit d’horaire.
          </p>
        </div>
        <div className="catalog-badge" title={catalog.source}>
          {catalog.shows.length} spectacles · {catalog.source.includes('démonstration') ? 'démo' : 'catalogue'}
        </div>
      </header>

      <Stepper steps={STEP_LABELS} current={step} onJump={setStep} />

      <div className="wizard">
        {step === 0 && <PresenceEditor windows={windows} onChange={setWindows} />}
        {step === 1 && (
          <div className="step-stack">
            <CatalogBrowser catalog={catalog} wishlist={wishlist} onAdd={addToWishlist} />
            <Wishlist
              catalog={catalog}
              wishlist={wishlist}
              onChange={setWishlist}
              favoritesCount={favorites.length}
              onLoadFavorites={loadFavorites}
            />
          </div>
        )}
        {step === 2 && <Settings settings={settings} onChange={setSettings} />}
        {step === 3 && (
          <PlanningView
            result={result}
            updatedAt={formatUpdated(catalog.generatedAt)}
            booked={booked}
            onToggleBooked={toggleBooked}
          />
        )}
      </div>

      <div className="wizard-nav">
        {step > 0 ? (
          <button className="nav-btn ghost" onClick={() => setStep(step - 1)}>
            ← {step === 3 ? 'Modifier mes paramètres' : 'Précédent'}
          </button>
        ) : (
          <span />
        )}
        {step < 3 && (
          <button className="nav-btn primary" onClick={() => setStep(step + 1)}>
            {step === 2 ? 'Voir mon planning →' : 'Suivant →'}
            {step === 0 && <span className="nav-hint">{windows.length} jour{windows.length > 1 ? 's' : ''}</span>}
            {step === 1 && <span className="nav-hint">{wishlistCount} pièce{wishlistCount > 1 ? 's' : ''}</span>}
          </button>
        )}
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
      <h2>Options</h2>
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
          Exclure les séances « quota Ticket’Off atteint » (garder seulement le réservable en ligne sur Ticket’Off — elles peuvent rester dispo en direct au théâtre)
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
