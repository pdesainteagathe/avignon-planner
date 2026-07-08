#!/usr/bin/env node
// Scraper for the Festival Off d'Avignon programme.
//
// Two decoupled modes (see scraper/README.md for the rationale):
//
//   node scraper/scrape.mjs catalog
//       Full crawl of the programme (paginated "Charger plus"). Rare (≈1×/day):
//       titles, venues, durations and performance datetimes barely change.
//       Writes public/catalog.json.
//
//   node scraper/scrape.mjs availability --ids s1,s2,s3
//       Targeted refresh of availability for the user's favourites only.
//       Frequent (every 1–2h), lightweight. Merges "available" flags into the
//       existing public/catalog.json without touching the rest.
//
//   node scraper/scrape.mjs dump --url <showUrl>
//       Print the raw HTML of one show page — use this to (re)discover the CSS
//       selectors below against the live DOM.
//
// Requires Playwright:  npm i -D playwright  &&  npx playwright install chromium
//
// NOTE: the SELECTORS block is the only site-specific part. It is written from
// the observed page structure but MUST be verified against the live DOM (use
// the `dump` mode) — the festival site changes between editions.

import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CATALOG_PATH = resolve(__dirname, '../public/catalog.json')
const BASE = 'https://www.festivaloffavignon.com'
const PROGRAMME_URL = `${BASE}/programme`

// --- Site-specific selectors (VERIFY with `dump` mode) ------------------------
const SELECTORS = {
  loadMore: 'button:has-text("Charger plus")',
  card: '[data-spectacle], article.spectacle, .programme-item',
  title: 'h2, .titre, .spectacle-titre',
  venue: '.lieu, .venue, [data-lieu]',
  duration: '.duree, [data-duree]',
  time: '.horaire, .heure, [data-horaire]',
  link: 'a[href*="/spectacles/"]',
  // On a show page: each dated performance and its bookable/sold-out state.
  perfRow: '.representation, [data-representation]',
  perfDate: '.date, [data-date]',
  soldOut: '.complet, .sold-out, [data-complet="true"]',
}
// -----------------------------------------------------------------------------

function parseArgs(argv) {
  const [mode, ...rest] = argv
  const args = { mode }
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--ids') args.ids = (rest[++i] ?? '').split(',').filter(Boolean)
    else if (rest[i] === '--url') args.url = rest[++i]
    else if (rest[i] === '--headful') args.headful = true
  }
  return args
}

async function launch(headful) {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    console.error(
      'Playwright manquant. Installe-le :\n' +
        '  npm i -D playwright && npx playwright install chromium',
    )
    process.exit(1)
  }
  const browser = await chromium.launch({ headless: !headful })
  const context = await browser.newContext({ locale: 'fr-FR' })
  return { browser, context }
}

/** Full catalogue crawl. */
async function scrapeCatalog(headful) {
  const { browser, context } = await launch(headful)
  const page = await context.newPage()
  await page.goto(PROGRAMME_URL, { waitUntil: 'networkidle' })

  // Exhaust the "Charger plus" pagination.
  for (let guard = 0; guard < 200; guard++) {
    const btn = page.locator(SELECTORS.loadMore)
    if ((await btn.count()) === 0 || !(await btn.first().isVisible())) break
    await btn.first().click()
    await page.waitForTimeout(600)
  }

  const cards = await page.locator(SELECTORS.card).all()
  console.error(`[catalog] ${cards.length} fiches détectées`)

  const shows = []
  for (const card of cards) {
    const show = await extractCard(card)
    if (show) shows.push(show)
  }

  // Second pass: visit each show page for full performance list + availability.
  for (const show of shows) {
    if (!show._url) continue
    try {
      const p = await context.newPage()
      await p.goto(show._url, { waitUntil: 'domcontentloaded' })
      show.performances = await extractPerformances(p)
      await p.close()
    } catch (e) {
      console.error(`[catalog] échec fiche ${show.title}: ${e.message}`)
    }
    delete show._url
  }

  await writeCatalog(shows)
  await browser.close()
}

async function extractCard(card) {
  const text = async (sel) =>
    (await card.locator(sel).first().textContent().catch(() => ''))?.trim() ?? ''
  const title = await text(SELECTORS.title)
  if (!title) return null
  const href = await card
    .locator(SELECTORS.link)
    .first()
    .getAttribute('href')
    .catch(() => null)
  const durationTxt = await text(SELECTORS.duration)
  const duration = parseInt(durationTxt.replace(/\D+/g, ''), 10)
  return {
    id: slug(title, href),
    title,
    venue: await text(SELECTORS.venue),
    durationMin: Number.isFinite(duration) ? duration : 75,
    performances: [],
    ticketUrl: href ? new URL(href, BASE).toString() : undefined,
    _url: href ? new URL(href, BASE).toString() : undefined,
  }
}

async function extractPerformances(page) {
  const rows = await page.locator(SELECTORS.perfRow).all()
  const perfs = []
  let i = 0
  for (const row of rows) {
    const dateTxt = (await row.locator(SELECTORS.perfDate).first().textContent().catch(() => '')) ?? ''
    const iso = parseFrenchDate(dateTxt.trim())
    if (!iso) continue
    const soldOut = (await row.locator(SELECTORS.soldOut).count().catch(() => 0)) > 0
    perfs.push({ id: `p${i++}`, start: iso, available: !soldOut })
  }
  return perfs
}

/** Targeted availability refresh for a subset of shows. */
async function scrapeAvailability(ids, headful) {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'))
  const wanted = new Set(ids)
  const targets = catalog.shows.filter((s) => wanted.has(s.id) && s.ticketUrl)
  console.error(`[availability] ${targets.length} favoris à rafraîchir`)

  const { browser, context } = await launch(headful)
  for (const show of targets) {
    try {
      const p = await context.newPage()
      await p.goto(show.ticketUrl, { waitUntil: 'domcontentloaded' })
      const fresh = await extractPerformances(p)
      // Merge availability by matching start datetime.
      const byStart = new Map(fresh.map((f) => [f.start, f.available]))
      for (const perf of show.performances) {
        if (byStart.has(perf.start)) perf.available = byStart.get(perf.start)
      }
      await p.close()
    } catch (e) {
      console.error(`[availability] échec ${show.title}: ${e.message}`)
    }
  }
  catalog.generatedAt = isoStamp()
  await browser.close()
  await writeCatalogRaw(catalog)
}

async function dump(url) {
  const { browser, context } = await launch(true)
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  console.log(await page.content())
  await browser.close()
}

// --- helpers -----------------------------------------------------------------

function slug(title, href) {
  const m = href?.match(/(\d+)/)
  if (m) return `off-${m[1]}`
  return 'off-' + title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 40)
}

const MONTHS = {
  janvier: '01', février: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', août: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12',
}

/** "10 juillet 2026 à 14h30" / "10/07 14:30" → "2026-07-10T14:30". */
function parseFrenchDate(txt) {
  if (!txt) return null
  let m = txt.match(/(\d{1,2})\s+([a-zûé]+)\s+(\d{4}).*?(\d{1,2})[h:](\d{2})/i)
  if (m && MONTHS[m[2].toLowerCase()]) {
    return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}`
  }
  m = txt.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?.*?(\d{1,2})[h:](\d{2})/)
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : '2026'
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}`
  }
  return null
}

function isoStamp() {
  // Avoid Date.now-style non-determinism concerns: fine here (real CLI run).
  return new Date().toISOString().slice(0, 16)
}

async function writeCatalog(shows) {
  await writeCatalogRaw({
    source: 'festivaloffavignon.com',
    generatedAt: isoStamp(),
    shows,
  })
}

async function writeCatalogRaw(catalog) {
  await mkdir(dirname(CATALOG_PATH), { recursive: true })
  await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8')
  console.error(`✓ écrit ${CATALOG_PATH} (${catalog.shows.length} spectacles)`)
}

// --- main --------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2))
switch (args.mode) {
  case 'catalog':
    await scrapeCatalog(args.headful)
    break
  case 'availability':
    if (!args.ids?.length) {
      console.error('Usage: scrape.mjs availability --ids s1,s2,s3')
      process.exit(1)
    }
    await scrapeAvailability(args.ids, args.headful)
    break
  case 'dump':
    if (!args.url) {
      console.error('Usage: scrape.mjs dump --url <showUrl>')
      process.exit(1)
    }
    await dump(args.url)
    break
  default:
    console.error('Modes: catalog | availability --ids .. | dump --url ..')
    process.exit(1)
}
