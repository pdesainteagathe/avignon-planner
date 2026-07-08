#!/usr/bin/env node
// Add a hand-listed set of favourite shows to public/catalog.json.
//
// Strategy: crawl the full programme listing (light), fuzzy-match each favourite
// by title (+ venue/time as confirmation), then fetch its real representations
// (exact dates, relâches, availability, seats, Ticket'Off URL). If a show cannot
// be matched on the site, fabricate its performances from the provided hints
// (full run 4–25 July minus the weekly relâche) and flag it as unverified.
//
//   node scraper/addFavorites.mjs [--dry]

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  BASE,
  CATALOG_PATH,
  fetchText,
  parseListing,
  parsePerformances,
  crawlListing,
  pool,
} from './lib.mjs'

const log = (m) => process.stderr.write(m + '\n')
const DRY = process.argv.includes('--dry')

// --- The favourites, as provided (title, venue hint, time, weekly relâche) ---
const FAVES = [
  { title: 'Pourquoi les gens qui sèment', venue: 'Gémeaux', time: '11h20', relache: 'mercredi' },
  { title: "L'affaire Petiot", venue: 'Actuel', time: '15h40', relache: 'mercredi', extras: [{ weekday: 'jeudi', time: '17h40' }] },
  { title: 'Le projet Barthes', venue: 'Train bleu', time: '11h20', relache: 'vendredi' },
  { title: "Et c'est tant mieux", venue: 'Oriflamme', time: '14h30', relache: 'jeudi' },
  { title: 'Après la chute', venue: 'Scala', time: '16h15', relache: 'lundi' },
  { title: 'Barbara (par Barbara)', venue: '11', time: '20h50', relache: 'vendredi' },
  { title: 'Walt, la folie Disney', venue: 'Chêne noir', time: '10h', relache: 'lundi' },
  { title: 'Ondes de choc', venue: 'Artephile', time: '14h', relache: 'dimanche' },
  { title: 'Ligne ouverte', venue: '11', time: '15h55', relache: 'vendredi' },
  { title: "L'affaire Rosalind Franklin", venue: 'Reine blanche', time: '14h40', relache: 'jeudi' },
  { title: 'Ostinato', venue: 'Villeneuve', time: '20h30', relache: 'mercredi' },
  { title: 'Molière et ses masques', venue: 'Train bleu', time: '19h40', relache: 'vendredi', complet: true },
  { title: 'Chimère', venue: 'Théâtre des Halles', time: '14h30', relache: 'mardi' },
  { title: 'Le dernier cèdre du Liban', venue: 'Béliers', time: '10h', relache: 'jeudi' },
  { title: 'Quand la ville se lève', venue: '11', time: '10h', relache: 'vendredi' },
  { title: 'Forcenés', venue: '11', time: '10h15', relache: 'vendredi' },
  { title: "A vau l'eau", venue: '11', time: '15h45', relache: 'vendredi' },
  { title: 'Les justes', venue: 'Gémeaux', time: '13h', relache: 'mercredi' },
  { title: 'Mon père avait 3 vaches', venue: 'Béliers', time: '14h15', relache: 'jeudi' },
  { title: 'Opéra punk', venue: 'Doms', time: '16h', relache: 'mercredi' },
  { title: "Post ! Comédie musicale d'un présent proche", venue: 'Essaïon', time: '21h55', relache: 'jeudi' },
  { title: 'Splendeurs et misères', venue: 'Girasole', time: '22h25', relache: 'mercredi' },
  { title: "Le conte d'hiver", venue: 'Chêne noir', time: '12h30', relache: 'lundi' },
  { title: 'Sucrer les fraises', venue: 'Factory les Antonins', time: '14h20', relache: 'jeudi' },
  { title: "Ne t'arrête pas de courir", venue: 'Actuel', time: '11h50', relache: 'mercredi', extras: [{ weekday: 'jeudi', time: '13h45' }] },
  { title: 'Enquête de famille', venue: 'Reine blanche', time: '18h', relache: 'jeudi' },
  { title: 'Charlotte', venue: 'Balcon', time: '17h', relache: 'jeudi' },
  { title: 'Les deux autres', venue: 'Béliers', time: '17h35', relache: 'jeudi' },
  { title: "Le jour où j'ai appris que j'étais vieux", venue: 'Gémeaux', time: '13h10', relache: 'mercredi' },
]

// --- helpers -----------------------------------------------------------------

const WEEKDAY = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 }
const FESTIVAL_DATES = (() => {
  const out = []
  for (let d = 4; d <= 25; d++) out.push(`2026-07-${String(d).padStart(2, '0')}`)
  return out
})()

function weekdayOf(isoDate) {
  return new Date(`${isoDate}T12:00:00`).getDay()
}

function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function titleForMatch(t) {
  return norm(t.split('/')[0]) // drop "/ JF Derec"-style suffixes
}

function jaccard(a, b) {
  const A = new Set(a.split(' ').filter(Boolean))
  const B = new Set(b.split(' ').filter(Boolean))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

function venueMatch(hint, venue) {
  const v = norm(venue)
  return norm(hint)
    .split(' ')
    .filter((t) => t.length >= 2 || /\d/.test(t))
    .every((t) => v.includes(t))
}

function parseTimeHint(txt) {
  const m = txt.match(/(\d{1,2})\s*h\s*(\d{2})?/)
  return m ? `${m[1].padStart(2, '0')}:${m[2] ?? '00'}` : null
}

function scoreMatch(fav, show) {
  const nd = titleForMatch(fav.title)
  const nl = norm(show.title)
  let title
  if (nl === nd) title = 1
  else if (nl.includes(nd) || nd.includes(nl)) title = 0.85
  else title = jaccard(nd, nl)
  const vBonus = venueMatch(fav.venue, show.venue) ? 0.15 : 0
  const tBonus = show.defaultTime && show.defaultTime === parseTimeHint(fav.time) ? 0.15 : 0
  return { score: title + vBonus + tBonus, title, vMatch: vBonus > 0, tMatch: tBonus > 0 }
}

function fabricate(fav) {
  const relDay = WEEKDAY[fav.relache]
  const time = parseTimeHint(fav.time)
  const perfs = []
  for (const date of FESTIVAL_DATES) {
    if (weekdayOf(date) === relDay) continue
    perfs.push({ id: `${date}-${time}`, start: `${date}T${time}`, available: !fav.complet })
  }
  for (const extra of fav.extras ?? []) {
    const wd = WEEKDAY[extra.weekday]
    const et = parseTimeHint(extra.time)
    for (const date of FESTIVAL_DATES) {
      if (weekdayOf(date) === wd) perfs.push({ id: `${date}-${et}`, start: `${date}T${et}`, available: !fav.complet })
    }
  }
  perfs.sort((a, b) => a.start.localeCompare(b.start))
  return {
    id: `off-fav-${norm(fav.title).replace(/ /g, '-').slice(0, 40)}`,
    title: fav.title,
    genre: undefined,
    venue: fav.venue,
    durationMin: 75,
    performances: perfs,
    unverified: true,
  }
}

// Server-side search: /programme?recherche=<term> returns only matching cards.
async function search(term) {
  const html = await fetchText(`${BASE}/programme?recherche=${encodeURIComponent(term)}`)
  // The site ranks the best match first even when it pads the page to ~48, so
  // we keep every card and let scoreMatch (title + venue + time) pick the right
  // one. The strict acceptance threshold guards against false positives.
  return html ? parseListing(html) : []
}

const STOP = new Set(
  ("le la les l un une des de du d et en au aux a ses son sa mon ma mes ne pas " +
    "qui que quoi ou se ce c est j ai il elle on par pour dans sur avec sans 3")
    .split(' '),
)

// Search terms, most distinctive first: longest content word, then two longest,
// then the whole title as a fallback.
function searchTerms(title) {
  const words = titleForMatch(title).split(' ').filter(Boolean)
  const content = words.filter((w) => !STOP.has(w) && w.length >= 3)
  const byLen = [...content].sort((a, b) => b.length - a.length)
  const terms = []
  if (byLen[0]) terms.push(byLen[0])
  if (byLen[1]) terms.push(`${byLen[0]} ${byLen[1]}`)
  terms.push(titleForMatch(title))
  return [...new Set(terms)]
}

// --- main --------------------------------------------------------------------

log('[favorites] recherche ciblée de chaque pièce sur le site…')

const matched = []
const misses = []
await pool(FAVES, 4, async (fav) => {
  let best = null
  for (const t of searchTerms(fav.title)) {
    for (const show of await search(t)) {
      const m = scoreMatch(fav, show)
      if (!best || m.score > best.m.score) best = { show, m }
    }
    if (best && best.m.title >= 0.85) break // strong match — no need for more terms
  }
  const ok = best && (best.m.title >= 0.6 || (best.m.title >= 0.45 && best.m.vMatch && best.m.tMatch))
  if (ok) matched.push({ fav, show: best.show, m: best.m })
  else misses.push({ fav, best })
})

// Fallback: titles made only of common words defeat the search (it returns a
// full page). Crawl the catalogue and re-match just those against it.
function bestIn(listing, fav) {
  let best = null
  for (const show of listing) {
    const m = scoreMatch(fav, show)
    if (!best || m.score > best.m.score) best = { show, m }
  }
  const ok = best && (best.m.title >= 0.6 || (best.m.title >= 0.45 && best.m.vMatch && best.m.tMatch))
  return ok ? best : null
}

if (misses.length) {
  log(`[favorites] ${misses.length} non trouvées par recherche → crawl de secours…`)
  const listing = await crawlListing(60, null, log)
  const stillMissing = []
  for (const { fav, best } of misses) {
    const hit = bestIn(listing, fav)
    if (hit) matched.push({ fav, show: hit.show, m: hit.m })
    else stillMissing.push({ fav, best })
  }
  misses.length = 0
  misses.push(...stillMissing)
}

log('\n=== MATCHS ===')
for (const { fav, show, m } of matched) {
  log(
    `✓ "${fav.title}" → "${show.title}" @ ${show.venue} ${show.defaultTime ?? ''} ` +
      `[score ${m.score.toFixed(2)}${m.vMatch ? ' lieu✓' : ''}${m.tMatch ? ' heure✓' : ''}]`,
  )
}
log('\n=== NON TROUVÉS (fabriqués depuis tes infos) ===')
for (const { fav, best } of misses) {
  log(`✗ "${fav.title}" (meilleur candidat: "${best?.show.title ?? '—'}" ${best?.m.score.toFixed(2) ?? ''}) → fabriqué`)
}

// Fetch real performances for matched shows.
log('\n[favorites] récupération des représentations réelles…')
await pool(matched, 5, async ({ show }) => {
  try {
    const html = await fetchText(show.reprUrl)
    if (html) show.performances = parsePerformances(html, show.defaultTime)
  } catch (e) {
    log(`[perf] échec ${show.title}: ${e.message}`)
  }
})

// Build the shows to add.
const toAdd = []
for (const { show } of matched) {
  const { reprUrl, defaultTime, ...clean } = show
  toAdd.push(clean)
}
for (const { fav } of misses) toAdd.push(fabricate(fav))

// Merge into the existing catalog (by id; favourites win on refresh).
const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'))
const byId = new Map(catalog.shows.map((s) => [s.id, s]))
let added = 0
let updated = 0
for (const s of toAdd) {
  if (byId.has(s.id)) updated++
  else added++
  byId.set(s.id, s)
}
catalog.shows = [...byId.values()]
catalog.generatedAt = new Date().toISOString().slice(0, 16)

const perfs = toAdd.reduce((n, s) => n + s.performances.length, 0)
log(
  `\n[favorites] ${matched.length} matchés + ${misses.length} fabriqués = ${toAdd.length} pièces ` +
    `(${perfs} représentations). Ajoutées: ${added}, mises à jour: ${updated}.`,
)

if (DRY) {
  log('[dry-run] catalog.json NON modifié.')
} else {
  await mkdir(dirname(CATALOG_PATH), { recursive: true })
  await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8')
  log(`✓ ${CATALOG_PATH} — total ${catalog.shows.length} spectacles.`)
}
