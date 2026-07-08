#!/usr/bin/env node
// Scraper for the Festival Off d'Avignon programme — pure HTTP (no browser).
// See scraper/README.md for the rationale. Shared logic lives in ./lib.mjs.
//
// Modes:
//   node scraper/scrape.mjs catalog [--limit N] [--pages N] [--concurrency C]
//   node scraper/scrape.mjs availability --ids off-8060,off-9155
//   node scraper/scrape.mjs one --url <detailOrReprUrl>

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  BASE,
  CATALOG_PATH,
  fetchText,
  idFromUrl,
  parsePerformances,
  pool,
  crawlListing,
  attachPerformances,
  writeCatalog,
} from './lib.mjs'

const log = (m) => process.stderr.write(m + '\n')

async function modeCatalog(opts) {
  const shows = await crawlListing(opts.pages ?? 45, opts.limit, log)
  log(`[catalog] ${shows.length} spectacles → récupération des représentations…`)
  await attachPerformances(shows, opts.concurrency ?? 5, log)
  const catalog = await writeCatalog(shows)
  const perfs = catalog.shows.reduce((n, s) => n + s.performances.length, 0)
  log(`✓ ${CATALOG_PATH}\n  ${catalog.shows.length} spectacles, ${perfs} représentations`)
}

async function modeAvailability(ids, concurrency) {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'))
  const wanted = new Set(ids)
  const targets = catalog.shows.filter((s) => wanted.has(s.id))
  log(`[availability] ${targets.length} favoris`)
  await pool(targets, concurrency ?? 5, async (show) => {
    const reprUrl =
      show.ticketUrl || `${BASE}/spectacles/representations/${show.id.replace('off-', '')}`
    try {
      const html = await fetchText(reprUrl)
      if (html) show.performances = parsePerformances(html, null)
    } catch (e) {
      log(`[availability] échec ${show.title}: ${e.message}`)
    }
  })
  catalog.generatedAt = new Date().toISOString().slice(0, 16)
  await mkdir(dirname(CATALOG_PATH), { recursive: true })
  await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8')
  log(`✓ dispos rafraîchies pour ${targets.length} spectacles`)
}

async function modeOne(url) {
  const id = idFromUrl(url)
  const reprUrl = url.includes('/representations/')
    ? url
    : `${BASE}/spectacles/representations/${id.replace('off-', '')}`
  const html = await fetchText(reprUrl)
  console.log(JSON.stringify(parsePerformances(html, null), null, 2))
}

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
