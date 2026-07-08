#!/usr/bin/env node
// Complement Ticket'Off availability with each theatre's OWN Mapado ticketing.
//
// Many shows show "quota atteint" on Ticket'Off (its online allocation is full)
// while the theatre still sells seats on its own Mapado billetterie. We scrape
// those channels and annotate matching performances with `theatreStatus`.
//
// Reliable signal (verified): each event page embeds a __NEXT_DATA__ blob whose
// per-date `notInStockContingentBookableStock` is the online-bookable count at
// the theatre — >0 = onSale, 0 = soldOut. (The rendered "SOLD OUT" tiles and the
// event-level `availabilityStatus` are NOT reliable per date.)
//
// Limitation: the event page exposes only its first ~7 dates. Partial coverage.
//
//   node scraper/mapado.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { CATALOG_PATH, fetchText, pool } from './lib.mjs'

const log = (m) => process.stderr.write(m + '\n')

// Theatres known to use Mapado, matched to catalog venues by substring.
const MAPADO_THEATRES = [
  { venueMatch: 'TRAIN BLEU', base: 'https://billetterie-theatredutrainbleu.mapado.com' },
  { venueMatch: 'ORIFLAMME', base: 'https://billetterie-oriflamme.mapado.com' },
  { venueMatch: '11 • AVIGNON', base: 'https://11avignon.mapado.com' },
]

function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function nextData(html) {
  const m = html && html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

/** Collect {title, slug} events from a Mapado billetterie homepage. */
function parseEvents(data) {
  const out = new Map()
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk)
    if (o && typeof o === 'object') {
      if (o.slug && o.title && /^\d+-/.test(o.slug)) out.set(o.slug, o.title)
      for (const v of Object.values(o)) walk(v)
    }
  }
  walk(data)
  return [...out.entries()].map(([slug, title]) => ({ slug, title }))
}

/** Per-date bookable map from an event page: "YYYY-MM-DDTHH:MM" -> onSale?. */
function parseEventDates(data) {
  const dates = new Map()
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk)
    if (o && typeof o === 'object') {
      const start = o.startDate || o.date
      if (start && 'notInStockContingentBookableStock' in o) {
        const key = String(start).slice(0, 16) // YYYY-MM-DDTHH:MM
        dates.set(key, o.notInStockContingentBookableStock > 0)
      }
      for (const v of Object.values(o)) walk(v)
    }
  }
  walk(data)
  return dates
}

async function scrapeTheatre(theatre) {
  const home = await fetchText(`${theatre.base}/`)
  const events = parseEvents(nextData(home))
  log(`[mapado] ${theatre.venueMatch}: ${events.length} spectacles`)
  const byTitle = new Map() // normTitle -> Map(dateKey -> onSale)
  await pool(events, 5, async (ev) => {
    try {
      const html = await fetchText(`${theatre.base}/event/${ev.slug}`)
      const dates = parseEventDates(nextData(html))
      if (dates.size) byTitle.set(norm(ev.title), dates)
    } catch (e) {
      log(`[mapado] échec ${ev.title}: ${e.message}`)
    }
  })
  return byTitle
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'))
  let annotated = 0
  let recovered = 0

  for (const theatre of MAPADO_THEATRES) {
    const byTitle = await scrapeTheatre(theatre)
    const shows = catalog.shows.filter((s) => (s.venue || '').includes(theatre.venueMatch))
    for (const show of shows) {
      const dates = byTitle.get(norm(show.title))
      if (!dates) continue
      for (const perf of show.performances) {
        const key = perf.start.slice(0, 16)
        if (!dates.has(key)) continue
        const onSale = dates.get(key)
        perf.theatreStatus = onSale ? 'onSale' : 'soldOut'
        annotated++
        if (perf.status === 'quota' && onSale) recovered++
      }
    }
  }

  catalog.theatresRefreshedAt = new Date().toISOString().slice(0, 16)
  await mkdir(dirname(CATALOG_PATH), { recursive: true })
  await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8')
  log(`✓ ${annotated} séances annotées ; ${recovered} "quota Ticket'Off" récupérées comme dispo au théâtre`)
}

await main()
