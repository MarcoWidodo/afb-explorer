/* Default indicator and its label, shared by every view so the same question
   is summarised the same way everywhere. */

export const MAX_BARS = 13

/** Scale codes (on-scale, i.e. excluding off-scale answers). */
export function scaleCodes(rec) {
  const off = new Set(rec.offscale || [])
  return rec.codes.filter(c => !off.has(c))
}

/** Means are offered only where the pipeline allows them (interval-like scales of 7+ points and numeric items). */
export function meanAllowed(rec, entry) {
  if (entry && entry.m != null) return !!entry.m
  return rec?.type === 'continuous'
}

export function defaultIndicator(rec, entry) {
  // the pipeline's default (instructions §5 and rule 7), when the catalogue carries one
  if (entry?.d) {
    if (entry.d.type === 'mean') return { type: 'mean' }
    const have = new Set(rec.codes)
    const codes = entry.d.codes.filter(c => have.has(c))
    if (codes.length) return { type: 'share', codes }
  }
  if (rec.type === 'continuous') return { type: 'mean' }
  const sc = scaleCodes(rec)
  // AB scales mostly run from the negative / "none" end (0 never … 4 always): the top two codes
  if (rec.type === 'ordinal') return { type: 'share', codes: sc.length >= 4 ? sc.slice(-2) : sc.slice(-1) }
  if (rec.type === 'binary') return { type: 'share', codes: sc.every(c => c === 0 || c === 1) ? [1] : sc.slice(0, 1) }
  // nominal: the most common answer across countries
  let best = rec.codes[0], bestP = -1
  for (const c of Object.values(rec.est)) {
    const cell = c.all
    if (!cell?.p) continue
    const codes = cell.k || rec.codes
    cell.p.forEach((p, i) => { if (p > bestP) { bestP = p; best = codes[i] } })
  }
  return { type: 'share', codes: [best] }
}

export function indicatorLabel(indicator, rec, base) {
  if (indicator.type === 'mean') {
    if (rec.type === 'continuous') return 'Mean'
    const sc = scaleCodes(rec)
    const lab = (c) => rec.labels[rec.codes.indexOf(c)]
    return `Mean (${sc[0]} = ${lab(sc[0])} … ${sc[sc.length - 1]} = ${lab(sc[sc.length - 1])})`
  }
  const labs = (indicator.codes || []).map(c => rec.labels[rec.codes.indexOf(c)] ?? c)
  const txt = labs.length > 3 ? `${labs.slice(0, 3).join(' + ')} + ${labs.length - 3} more` : labs.join(' + ')
  return `% ${txt}${base === 'asked' ? ' (all asked)' : ''}`
}

/** Axis range for means: the observed range (numeric items) or the on-scale codes. */
export function meanDomain(rec) {
  if (rec.type === 'continuous') return rec.range
  const on = rec.codes.filter(c => !(rec.offscale || []).includes(c))
  return [Math.min(...on), Math.max(...on)]
}
