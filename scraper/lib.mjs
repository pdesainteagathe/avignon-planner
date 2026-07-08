// Shared scraping helpers for festivaloffavignon.com (pure HTTP + cheerio).

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const CATALOG_PATH = resolve(__dirname, '../public/catalog.json')
export const BASE = 'https://www.festivaloffavignon.com'
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
export const DELAY_MS = 150

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function fetchText(url, tries = 3) {
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

export function idFromUrl(url) {
  const m = url?.match(/\/spectacles\/(?:representations\/)?(\d+)/)
  return m ? `off-${m[1]}` : null
}

/** "21h40" → "21:40"; "9h" → "09:00". */
export function parseTime(txt) {
  const m = (txt || '').match(/(\d{1,2})\s*h\s*(\d{2})?/i)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`
}

/** "1h", "1h30", "50 min" → minutes. */
export function parseDuration(txt) {
  const t = (txt || '').toLowerCase()
  let m = t.match(/(\d+)\s*h\s*(\d{1,2})?/)
  if (m) return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0)
  m = t.match(/(\d+)\s*min/)
  if (m) return parseInt(m[1], 10)
  return 75
}

export const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()

/** Parse one programme listing page → array of show metadata (no performances). */
export function parseListing(html) {
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
export function parsePerformances(html, defaultTime) {
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
      available: canReserve && status === 'available',
      // Some venues don't publish counts (0) — store undefined, not a fake 0.
      seatsLeft: Number.isFinite(seats) && seats > 0 ? seats : undefined,
    })
  })
  return perfs
}

/** Detail page URL (/spectacles/NNNN-slug) from a representations URL. */
export function detailUrlFromTicket(ticketUrl) {
  return ticketUrl ? ticketUrl.replace('/representations/', '/') : null
}

/**
 * Venue coordinates from a show detail page. The venue's location is the
 * "maps/search?query=lat,lng" link (distinct from the festival office's
 * "maps/place/..." link). Returns null if absent.
 */
export function parseVenueCoords(html) {
  const m = html.match(/maps\/search\/\?api=1&query=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

export async function pool(items, concurrency, worker) {
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

export async function crawlListing(maxPages, limit, log = () => {}) {
  const byId = new Map()
  let zeroStreak = 0
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
    log(`[listing] page ${page}: +${added} (total ${byId.size})`)
    if (limit && byId.size >= limit) break
    // The site rotates ordering, so a single page can add nothing by chance.
    // Only stop once several consecutive pages bring nothing new (saturated).
    zeroStreak = added === 0 ? zeroStreak + 1 : 0
    if (zeroStreak >= 5) break
    await sleep(DELAY_MS)
  }
  let all = [...byId.values()]
  if (limit) all = all.slice(0, limit)
  return all
}

export async function attachPerformances(shows, concurrency, log = () => {}) {
  let done = 0
  await pool(shows, concurrency, async (show) => {
    try {
      const html = await fetchText(show.reprUrl)
      if (html) show.performances = parsePerformances(html, show.defaultTime)
    } catch (e) {
      log(`[perf] échec ${show.title}: ${e.message}`)
    }
    if (++done % 25 === 0 || done === shows.length) log(`[perf] ${done}/${shows.length}`)
  })
}

/** Drop internal-only fields before serialising. */
export function tidy(shows) {
  return shows.map(({ reprUrl, defaultTime, ...s }) => s)
}

export async function writeCatalog(shows) {
  await mkdir(dirname(CATALOG_PATH), { recursive: true })
  const catalog = {
    source: 'festivaloffavignon.com',
    generatedAt: new Date().toISOString().slice(0, 16),
    shows: tidy(shows),
  }
  await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8')
  return catalog
}
