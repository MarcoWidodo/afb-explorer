/* ─────────────────────────────────────────────────────────────
   trend.js: where a trend line may be drawn and where it must break
   (instructions rule 6). Shared by the Time-Series view and
   pipeline/check_regions.mjs, and identical to trend_positions() in
   pipeline/R/40_indicators.R.

   tb = { breaks: [[a, b], …], start, note } from the catalogue:
     - rounds before `start` are not drawn in the trend view;
     - a break (a, b) separates consecutive rounds (x, y) whenever x ≤ a and b ≤ y.
   Positions: +1 per round shown, +2 across a break, so two points are joined only when
   their positions differ by exactly 1. A country missing in a round the question was
   asked also breaks its line (positions are per round, so the gap shows).
   ───────────────────────────────────────────────────────────── */

export function trendRounds(units, tb) {
  const start = tb?.start ?? -Infinity
  return [...units].filter(u => u >= start).sort((a, b) => a - b)
}

export function crossesBreak(x, y, tb) {
  return (tb?.breaks || []).some(([a, b]) => x <= a && b <= y)
}

export function trendPositions(units, tb) {
  const rs = trendRounds(units, tb)
  const pos = {}
  let k = 0
  rs.forEach((r, i) => {
    if (i > 0) k += crossesBreak(rs[i - 1], r, tb) ? 2 : 1
    pos[r] = k
  })
  return pos
}

/** The segments a line is drawn in, e.g. "R3 | R4 | R5–R7 | R8–R10". */
export function segmentLabel(units, tb) {
  const pos = trendPositions(units, tb)
  const rs = trendRounds(units, tb)
  const segs = []
  rs.forEach((r, i) => {
    if (i === 0 || pos[r] - pos[rs[i - 1]] > 1) segs.push([r])
    else segs[segs.length - 1].push(r)
  })
  return segs.map(s => (s.length > 1 ? `R${s[0]}–R${s[s.length - 1]}` : `R${s[0]}`)).join(' | ')
}
