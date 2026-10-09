/* Choosing a question in a round's own file (scope B) when the round or the question list
   changes: the same battery item if this round's file has it, else the same variable name,
   else the source of support for democracy, else the first question. `prev` is the
   previously shown entry ({ id, code, h }) or a battery id. */
export function pickRoundItem(vars, prev, battery, fallback = 'dem_support') {
  if (!vars?.length) return null
  const p = typeof prev === 'string' ? { id: prev } : (prev || {})
  const isBattery = p.id && (!p.code || p.code === p.id) && battery?.vars?.some(v => v.id === p.id)
  const hs = isBattery ? [p.id] : (p.h || [])
  return (hs.length && vars.find(v => (v.h || []).some(h => hs.includes(h)))?.id)
    || (p.code && vars.find(v => v.code?.toLowerCase() === p.code.toLowerCase())?.id)
    || vars.find(v => (v.h || []).includes(fallback))?.id
    || vars[0].id
}
