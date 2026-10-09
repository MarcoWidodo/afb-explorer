// Regional lines computed by the SITE'S OWN JavaScript (src/lib/stats.js, src/lib/trend.js), from the
// published files, against ab_region() in R (pipeline/output/region_reference.csv, written by
// build_site_data.Rmd): value, n_countries, the hybrid-axis x position (year_mid) and the round
// label, for every battery item, every country set and both bases. Same rules as the Time-Series
// view: rounds before a declared start are left out; balanced sets need every member. Also checks
// that no trend line joins two rounds across a declared break and that no statement item has a mean.
// Usage: node pipeline/check_regions.mjs        (exit code 1 on any difference)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cellValue, regionValue, roundLabel } from '../src/lib/stats.js'
import { trendRounds, trendPositions, crossesBreak, segmentLabel } from '../src/lib/trend.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(here, '..', 'public', 'data')
const read = (p) => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8'))
const manifest = read('manifest.json')
const index = read('index.json')
const yearOf = (iso, r) => manifest.countries[iso]?.waves?.[r]?.year

// region_reference.csv: var,base,set,round,value,n_countries,year_mid,round_label (labels contain no commas)
const csv = fs.readFileSync(path.join(here, 'output', 'region_reference.csv'), 'utf8').trim().split('\n')
const head = csv[0].split(',').map(s => s.replace(/"/g, ''))
const ref = csv.slice(1).map(line => Object.fromEntries(line.split(',').map((v, i) => [head[i], v.replace(/"/g, '')])))
const refBy = new Map()
for (const r of ref) {
  const k = `${r.var}|${r.base}|${r.set}`
  if (!refBy.has(k)) refBy.set(k, [])
  refBy.get(k).push(r)
}

let points = 0, maxPerCode = 0, maxMean = 0, labelsChecked = 0
const fails = []
for (const entry of index.vars) {
  const rec = read(`v/${entry.id}.json`)
  const rounds = trendRounds(rec.units, entry.tb)
  const bases = entry.d.type === 'mean' ? ['mean'] : ['valid', 'asked']
  const k = entry.d.type === 'mean' ? 0 : entry.d.codes.length
  for (const base of bases) {
    const indicator = base === 'mean' ? { type: 'mean' } : { type: 'share', codes: entry.d.codes }
    for (const set of manifest.country_sets) {
      const site = new Map()
      for (const r of rounds) {
        const byC = Object.fromEntries(set.countries.map(c => {
          const cell = rec.est[r]?.[c]
          return [c, cell ? cellValue(cell, rec.codes, indicator, base === 'mean' ? 'valid' : base) : null]
        }))
        const v = regionValue(byC, set.countries, !set.balanced, c => yearOf(c, r))
        if (v) site.set(r, v)
      }
      const want = refBy.get(`${entry.id}|${base}|${set.id}`) || []
      if (want.length !== site.size) fails.push([entry.id, base, set.id, 'rounds', want.length, site.size])
      const ks = new Set()
      for (const w of want) {
        const s = site.get(Number(w.round))
        if (!s) { fails.push([entry.id, base, set.id, w.round, 'missing on site']); continue }
        const d = Math.abs(s.value - Number(w.value))
        points++
        if (base === 'mean') maxMean = Math.max(maxMean, d)
        else {
          maxPerCode = Math.max(maxPerCode, d / Math.max(1, k))
          if (d > (base === 'valid' ? 0.051 : 0.101) * Math.max(1, k)) fails.push([entry.id, base, set.id, w.round, 'value', s.value, w.value])
        }
        if (s.n_countries !== Number(w.n_countries)) fails.push([entry.id, base, set.id, w.round, 'n_countries', s.n_countries, w.n_countries])
        if (s.year_mid !== Number(w.year_mid)) fails.push([entry.id, base, set.id, w.round, 'year_mid', s.year_mid, w.year_mid])
        if (roundLabel(Number(w.round), s.year_min, s.year_max) !== w.round_label) fails.push([entry.id, base, set.id, w.round, 'label', roundLabel(Number(w.round), s.year_min, s.year_max), w.round_label])
        labelsChecked++
        ks.add(s.n_countries)
      }
      if (set.balanced && ks.size > 1) fails.push([entry.id, base, set.id, 'n_countries not constant', [...ks].join('/')])
    }
  }
  // breaks: two rounds are joined only when their positions differ by 1; never across a declared break
  if (entry.tb) {
    const pos = trendPositions(rec.units, entry.tb)
    rounds.forEach((r, i) => {
      if (i > 0 && crossesBreak(rounds[i - 1], r, entry.tb) && pos[r] - pos[rounds[i - 1]] === 1) fails.push([entry.id, 'joined across a break', rounds[i - 1], r])
    })
    if (entry.tb.start && rounds.some(r => r < entry.tb.start)) fails.push([entry.id, 'round before start drawn'])
  }
  if (entry.id.startsWith('ab_')) {
    if (entry.m) fails.push([entry.id, 'mean allowed'])
    for (const uu of Object.values(rec.est)) for (const cell of Object.values(uu)) if (cell.m != null) fails.push([entry.id, 'mean written'])
  }
}
const segs = Object.fromEntries(['ab_media_free', 'ab_govt_employee', 'corr_mps', 'voted', 'demonstration', 'trust_police', 'dem_extent']
  .map(id => { const e = index.vars.find(v => v.id === id); return [id, e ? segmentLabel(e.u, e.tb) : null] }))
const ok = !fails.length && points > 0 && maxPerCode <= 0.101 && maxMean <= 0.0006
console.log(JSON.stringify({ items: index.vars.length, sets: manifest.country_sets.length, points, labelsChecked, maxPerCode, maxMean, segments: segs }, null, 1))
if (fails.length) console.log('FAILURES', fails.slice(0, 20))
console.log(ok ? 'ALL REGIONAL LINES MATCH ab_region() (value, n_countries, year_mid, round label); NO LINE CROSSES A BREAK' : 'CHECK FAILED')
process.exit(ok ? 0 : 1)
