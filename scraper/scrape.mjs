#!/usr/bin/env node
// Scraper for the Festival Off d'Avignon programme — pure HTTP (no browser).
//
// The site is server-rendered: the programme paginates via ?page=N (48 cards
// per page) and each show's "representations" page exposes every dated
// performance with its availability and remaining seats as plain data-*
// attributes. No login is needed for this public level.
//
// Modes:
//   node scraper/scrape.mjs catalog [--limit N] [--pages N] [--concurrency C]
//       Full crawl → public/catalog.json. Rare (≈1×/day). --limit caps the
//       number of shows (handy for testing without hitting all ~1900).
//
//   node scraper/scrape.mjs availability --ids off-8060,off-9155
//       Refresh only these shows' performances/availability in place. Frequent.
//
//   node scraper/scrape.mjs one --url <detailOrReprUrl>
//       Parse and print one show (debug).
//
// Politeness: small delay + limited concurrency. Please keep it that way.

import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CATALOG_PATH = resolve(__dirname, '../public/catalog.json')
const BASE = 'https://www.festivaloffavignon.com'
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const DELAY_MS = 150

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR' } })
      if (res.ok) return await res.text()
      if (res.status === 404) return null
      throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      if (i === tries - 1) throw e
      await sleep(500 * (i + 1))
    }
  }
}

// --- parsing -----------------------------------------------------------------

function idFromUrl(url) {
  const m = url?.match(/\/spectacles\/(?:representations\/)?(\d+)/)
  return m ? `off-${m[1]}` : null
}

/** "21h40" → "21:40"; "9h" → "09:00". */
function parseTime(txt) {
  const m = (txt || '').match(/(\d{1,2})\s*h\s*(\d{2})?/i)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`
}

/** "1h", "1h30", "50 min" → minutes. */
function parseDuration(txt) {
  const t = (txt || '').toLowerCase()
  let m = t.match(/(\d+)\s*h\s*(\d{1,2})?/)
  if (m) return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0)
  m = t.match(/(\d+)\s*min/)
  if (m) return parseInt(m[1], 10)
  return 75
}

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()

/** Parse one programme listing page → array of show metadata (no performances). */
function parseListing(html) {
  const $ = cheerio.load(html)
  const shows = []
  $('.global-card.spectacle-card').each((_, el) => {
    const card = $(el)
    const nom = card.find('a.card-nom')
    const detailUrl = nom.attr('href')
    const id = idFromUrl(detailUrl || '')
    const title = clean(nom.text())
    if (!id || !title) return
    const reprHref = card.find('a[href*="/spectacles/representations/"]').attr('href')
    const reprUrl = reprHref
      ? new URL(reprHref, BASE).toString()
      : `${BASE}/spectacles/representations/${id.replace('off-', '')}`
    // First plain .tag is the genre; the Ticket'Off link is .tag.tag-orange.
    const genre = clean(card.find('.liste-tags .tag').not('.tag-orange').first().text())
    shows.push({
      id,
      title,
      company: undefined,
      genre: genre || undefined,
      venue: clean(card.find('.theatre').text()),
      durationMin: parseDuration(card.find('.duree').text()),
      defaultTime: parseTime(card.find('.heure').text()),
      reprUrl,
      ticketUrl: reprUrl,
      performances: [],
    })
  })
  return shows
}

/** Parse a representations page → performances with availability & seats. */
function parsePerformances(html, defaultTime) {
  const $ = cheerio.load(html)
  const perfs = []
  $('.js-card-date').each((_, el) => {
    const c = $(el)
    const date = c.attr('data-date')
    if (!date) return
    const time = parseTime(c.attr('data-heure')) || defaultTime || '00:00'
    const canReserve = c.attr('data-can-reserve') === '1'
    const status = c.attr('data-status')
    const seats = parseInt(c.attr('data-nb-place') || '', 10)
    perfs.push({
      id: c.attr('id') || `${date}`,
      start: `${date}T${time}`,
      // Bookable = the site says you can reserve. Past dates report
      // "unavailable" and are naturally excluded by presence windows anyway.
      available: canReserve && status === 'available',
      seatsLeft: Number.isFinite(seats) ? seats : undefined,
    })
  })
  return perfs
}

// --- concurrency pool --------------------------------------------------------

async function pool(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
      await sleep(DELAY_MS)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}

// --- modes -------------------------------------------------------------------

async function crawlListing(maxPages, limit) {
  const byId = new Map()
  for (let page = 1; page <= maxPages; page++) {
    const html = await fetchText(`${BASE}/programme?page=${page}`)
    if (!html) break
    const shows = parseListing(html)
    if (shows.length === 0) break
    let added = 0
    for (const s of shows) {
      if (!byId.has(s.id)) {
        byId.set(s.id, s)
        added++
      }
    }
    process.stderr.write(
      `[listing] page ${page}: +${added} (total ${byId.size})\n`,
    )
    if (limit && byId.size >= limit) break
    // Stop when a full page brings nothing new (end of randomised rotation).
    if (added === 0) break
    await sleep(DELAY_MS)
  }
  let all = [...byId.values()]
  if (limit) all = all.slice(0, limit)
  return all
}

async function attachPerformances(shows, concurrency) {
  let done = 0
  await pool(shows, concurrency, async (show) => {
    try {
      const html = await fetchText(show.reprUrl)
      if (html) show.performances = parsePerformances(html, show.defaultTime)
    } catch (e) {
      process.stderr.write(`[perf] échec ${show.title}: ${e.message}\n`)
    }
    if (++done % 25 === 0 || done === shows.length) {
      process.stderr.write(`[perf] ${done}/${shows.length}\n`)
    }
  })
}

function tidy(shows) {
  return shows.map(({ reprUrl, defaultTime, ...s }) => s)
}

async function writeCatalog(shows) {
  await mkdir(dirname(CATALOG_PATH), { recursive: true })
  const catalog = {
    source: 'festivaloffavignon.com',
    generatedAt: new Date().toISOString().slice(0, 16),
    shows: tidy(shows),
  }
  await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8')
  const perfs = shows.reduce((n, s) => n + s.performances.length, 0)
  process.stderr.write(`✓ ${CATALOG_PATH}\n  ${shows.length} spectacles, ${perfs} représentations\n`)
}

async function modeCatalog(opts) {
  const shows = await crawlListing(opts.pages ?? 45, opts.limit)
  process.stderr.write(`[catalog] ${shows.length} spectacles → récupération des représentations…\n`)
  await attachPerformances(shows, opts.concurrency ?? 5)
  await writeCatalog(shows)
}

async function modeAvailability(ids, concurrency) {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'))
  const wanted = new Set(ids)
  const targets = catalog.shows.filter((s) => wanted.has(s.id))
  process.stderr.write(`[availability] ${targets.length} favoris\n`)
  await pool(targets, concurrency ?? 5, async (show) => {
    const reprUrl = show.ticketUrl || `${BASE}/spectacles/representations/${show.id.replace('off-', '')}`
    try {
      const html = await fetchText(reprUrl)
      if (html) show.performances = parsePerformances(html, null)
    } catch (e) {
      process.stderr.write(`[availability] échec ${show.title}: ${e.message}\n`)
    }
  })
  catalog.generatedAt = new Date().toISOString().slice(0, 16)
  await mkdir(dirname(CATALOG_PATH), { recursive: true })
  await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8')
  process.stderr.write(`✓ dispos rafraîchies pour ${targets.length} spectacles\n`)
}

async function modeOne(url) {
  const id = idFromUrl(url)
  const reprUrl = url.includes('/representations/')
    ? url
    : `${BASE}/spectacles/representations/${id.replace('off-', '')}`
  const html = await fetchText(reprUrl)
  console.log(JSON.stringify(parsePerformances(html, null), null, 2))
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const [mode, ...rest] = argv
  const o = { mode }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--ids') o.ids = (rest[++i] || '').split(',').filter(Boolean)
    else if (a === '--url') o.url = rest[++i]
    else if (a === '--limit') o.limit = parseInt(rest[++i], 10)
    else if (a === '--pages') o.pages = parseInt(rest[++i], 10)
    else if (a === '--concurrency') o.concurrency = parseInt(rest[++i], 10)
  }
  return o
}

const o = parseArgs(process.argv.slice(2))
switch (o.mode) {
  case 'catalog':
    await modeCatalog(o)
    break
  case 'availability':
    if (!o.ids?.length) {
      console.error('Usage: scrape.mjs availability --ids off-8060,off-9155')
      process.exit(1)
    }
    await modeAvailability(o.ids, o.concurrency)
    break
  case 'one':
    if (!o.url) {
      console.error('Usage: scrape.mjs one --url <url>')
      process.exit(1)
    }
    await modeOne(o.url)
    break
  default:
    console.error('Modes: catalog [--limit N] | availability --ids .. | one --url ..')
    process.exit(1)
}
