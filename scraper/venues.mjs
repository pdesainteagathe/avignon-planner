#!/usr/bin/env node
// Build public/venues.json = { venueName: {lat, lng} } by scraping one show
// detail page per distinct venue (coords live in a maps/search link there).
//
//   node scraper/venues.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { CATALOG_PATH, fetchText, detailUrlFromTicket, parseVenueCoords, pool } from './lib.mjs'

const log = (m) => process.stderr.write(m + '\n')
const VENUES_PATH = resolve(dirname(CATALOG_PATH), 'venues.json')

const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'))

// One representative show (with a ticket URL) per distinct venue.
const repByVenue = new Map()
for (const s of catalog.shows) {
  if (!s.venue || repByVenue.has(s.venue)) continue
  if (s.ticketUrl) repByVenue.set(s.venue, s)
}
const targets = [...repByVenue.entries()]
log(`[venues] ${targets.length} théâtres à géolocaliser`)

const coords = {}
let done = 0
let ok = 0
await pool(targets, 6, async ([venue, show]) => {
  const url = detailUrlFromTicket(show.ticketUrl)
  try {
    const html = await fetchText(url)
    const c = html && parseVenueCoords(html)
    if (c) {
      coords[venue] = c
      ok++
    }
  } catch (e) {
    log(`[venues] échec ${venue}: ${e.message}`)
  }
  if (++done % 25 === 0 || done === targets.length) log(`[venues] ${done}/${targets.length} (${ok} géolocalisés)`)
})

await mkdir(dirname(VENUES_PATH), { recursive: true })
await writeFile(
  VENUES_PATH,
  JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 16), venues: coords }, null, 2),
  'utf8',
)
log(`✓ ${VENUES_PATH} — ${ok}/${targets.length} théâtres géolocalisés`)
