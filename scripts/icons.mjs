#!/usr/bin/env node
// Regenerate PNG fallbacks from public/favicon.svg (for Safari / iOS, which
// don't use SVG favicons). Run: npm run icons
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pub = resolve(dirname(fileURLToPath(import.meta.url)), '../public')
const svg = readFileSync(resolve(pub, 'favicon.svg'), 'utf8')

const render = (w) => new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng()
writeFileSync(resolve(pub, 'favicon-32.png'), render(32))
writeFileSync(resolve(pub, 'apple-touch-icon.png'), render(180))
console.log('✓ favicon-32.png + apple-touch-icon.png regénérés')
