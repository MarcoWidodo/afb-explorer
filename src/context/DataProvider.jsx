import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'

/* ─────────────────────────────────────────────────────────────
   Data layer. Only manifest.json is fetched at start-up. Everything else is
   fetched per question when a view needs it, cached for the session, and
   de-duplicated if two components ask at once.

   Afrobarometer layout (units are rounds 1–10; countries are keyed by ISO3):
     index.json               harmonised battery: one entry per question, all rounds
     rounds/<r>.json          every question in round r's own file (scope B)
     v/<id>.json              all respondents. Battery: every round. Round-file
                              question (id R7_Q28): its round only
     g/<r>/<id>.json          subgroup cells for one round (on demand)
     r/<r>/index.json         battery items correlated in round r (column order)
     r/<r>/<id>.json          within-country correlations of <id> with those items
   ───────────────────────────────────────────────────────────── */

const BASE = `${import.meta.env.BASE_URL}data`
const cache = new Map()

function fetchJSON(path) {
  const url = `${BASE}/${path}`
  if (!cache.has(url)) {
    const p = fetch(url).then(r => {
      if (!r.ok) throw new Error(`${r.status} loading ${path}`)
      return r.json()
    })
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return cache.get(url)
}

export const api = {
  manifest: () => fetchJSON('manifest.json'),
  index: () => fetchJSON('index.json'),
  roundIndex: (r) => fetchJSON(`rounds/${r}.json`),
  variable: (id) => fetchJSON(`v/${id}.json`),
  groups: (unit, id) => fetchJSON(`g/${unit}/${id}.json`).catch(() => ({ est: {} })),
  corrIndex: (unit) => fetchJSON(`r/${unit}/index.json`),
  correlations: (unit, id) => fetchJSON(`r/${unit}/${id}.json`).catch(() => null),
  geoWorld: () => fetchJSON('geo/world-110m.json'),
  geoRegion: () => fetchJSON('geo/region-50m.json'),
}

/** Round-file questions have ids like R7_Q28. */
export const isRoundItem = (id) => /^R\d+_/.test(id || '')

/**
 * One question in one unit (round), in the shape the views use:
 * { ...question metadata, unit, est: { ISO3: { all: cell, men: cell, … } } }.
 * Subgroup cells are merged in when `groups` is given.
 */
export function unitRecord(rec, unit, groups) {
  if (!rec) return null
  const uu = rec.est[unit]
  if (!uu) return { ...rec, unit, est: {} }
  const est = {}
  for (const [cc, cell] of Object.entries(uu)) est[cc] = { all: cell, ...(groups?.est?.[cc] || {}) }
  return { ...rec, unit, est }
}

/** All subgroup files of a question (one per round), for the trend view's breakdowns. */
export function loadAllGroups(rec) {
  return Promise.all(rec.units.map(u => api.groups(u, rec.id).then(g => [u, g.est || {}])))
    .then(pairs => Object.fromEntries(pairs))
}

/**
 * useResource(loader, deps): { data, loading, error } for any api call.
 * `loader` returns a promise (or null to skip). Stale responses are ignored.
 */
export function useResource(loader, deps) {
  const [state, setState] = useState({ data: null, loading: false, error: null })
  useEffect(() => {
    const p = loader()
    if (!p) { setState({ data: null, loading: false, error: null }); return }
    let live = true
    setState(s => ({ data: s.data, loading: true, error: null }))
    p.then(data => live && setState({ data, loading: false, error: null }))
     .catch(error => live && setState({ data: null, loading: false, error }))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

/** One question in one round (with subgroup cells when `withGroups`). */
export function useUnitVariable(id, unit, withGroups) {
  return useResource(
    () => (id && unit ? Promise.all([api.variable(id), withGroups ? api.groups(unit, id) : null])
      .then(([rec, g]) => unitRecord(rec, unit, g)) : null),
    [id, unit, withGroups]
  )
}

/** Several questions in one round (e.g. both axes of a scatter plot). */
export function useUnitVariables(unit, ids) {
  const key = ids.filter(Boolean).join('|')
  return useResource(
    () => (key && unit ? Promise.all(ids.map(id => (id ? api.variable(id).then(r => unitRecord(r, unit)) : null))) : null),
    [unit, key]
  )
}

/**
 * The question catalogue a single-round view offers: the harmonised battery items asked
 * in that round, or (source = 'round') every question in that round's own file.
 * Items: { id, code, q, s, t, d, m, ends, h?, u? } — `code` is what the picker shows.
 */
export function useQuestionList(source, unit) {
  const { data: index } = useResource(() => api.index(), [])
  const { data: rIndex } = useResource(() => (source === 'round' && unit ? api.roundIndex(unit) : null), [source, unit])
  return useMemo(() => {
    if (source === 'round') {
      if (!rIndex || rIndex.round !== unit) return null
      return { sections: rIndex.sections, vars: rIndex.vars, battery: index }
    }
    if (!index) return null
    return { sections: index.sections, vars: index.vars.map(v => ({ ...v, code: v.id })), battery: index }
  }, [source, unit, index, rIndex])
}

/* Colours. 45 countries cannot each have a distinct hue, so a country's colour comes
   from its position in the current selection (16 slots, the first 8 most distinct);
   outside a selection countries take their AB subregion's colour. */
export const N_SLOTS = 16
export const slotColor = (i) => `var(--slot-${((i % N_SLOTS) + N_SLOTS) % N_SLOTS})`

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [manifest, setManifest] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.manifest().then(setManifest).catch(e => setError(e.message))
  }, [])

  const helpers = useMemo(() => {
    if (!manifest) return {}
    const countries = manifest.countries
    const byName = (a, b) => countries[a].name.localeCompare(countries[b].name)
    const groupLabels = { all: 'All respondents' }
    manifest.subgroups.forEach(s => s.groups.forEach(g => { groupLabels[g.id] = g.label }))
    const waveById = Object.fromEntries(manifest.waves.map(w => [w.id, w]))
    const unit = manifest.unit_label || 'Wave'
    const regionColor = (iso) => `var(--region-${countries[iso]?.subregion || 'none'})`
    return {
      unit,
      units: manifest.waves.map(w => w.id),
      countryName: (iso) => countries[iso]?.name || iso,
      // with a selection list: the country's slot colour; otherwise its subregion colour
      countryColor: (iso, selection) => {
        const i = selection ? selection.indexOf(iso) : -1
        return i >= 0 ? slotColor(i) : regionColor(iso)
      },
      regionColor,
      iso3: (iso) => countries[iso]?.iso3 || iso,
      allCountries: Object.keys(countries).sort(byName),
      waveCountries: (w) => [...(waveById[w]?.countries || [])].sort(byName),
      wave: (w) => waveById[w],
      waveLabel: (w) => waveById[w] ? `${waveById[w].label} (${waveById[w].years})` : `${unit} ${w}`,
      fieldworkYear: (iso, w) => countries[iso]?.waves?.[w]?.year ?? null,
      groupLabel: (g) => groupLabels[g] || g,
      countrySet: (id) => manifest.country_sets.find(s => s.id === id),
      sortByName: (list) => [...list].sort(byName),
    }
  }, [manifest])

  const value = useMemo(() => ({ manifest, error, loading: !manifest && !error, ...helpers }),
    [manifest, error, helpers])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}

/** Source line used under every chart and in every export. */
export function useSourceNote() {
  const { manifest } = useData()
  return useCallback(({ waves, base, weighted = true, set, extra, hybrid } = {}) => {
    if (!manifest) return ''
    const nr = manifest.survey.nr_text || "Don't know / refused"
    const parts = [`Source: ${manifest.survey.name}${waves ? `, ${waves}` : ''}.`]
    if (weighted) parts.push('Weighted within country-round (EA-level weight).')
    if (base === 'valid') parts.push(`% of valid answers; ${nr.toLowerCase()} excluded from the base.`)
    if (base === 'asked') parts.push(`% of respondents asked; ${nr.toLowerCase()} included in the base.`)
    if (set) parts.push(set)
    if (hybrid) parts.push("Country points at each country's fieldwork year; regional points at the median fieldwork year of the set's countries in each round.")
    if (extra) parts.push(extra)
    return parts.join(' ')
  }, [manifest])
}
