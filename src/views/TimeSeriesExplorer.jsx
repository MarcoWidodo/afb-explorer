import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData, useResource, api, loadAllGroups, useSourceNote } from '../context/DataProvider'
import VariablePicker from '../components/shared/VariablePicker'
import CountryPicker from '../components/shared/CountryPicker'
import DetailPanel, { QuestionHistory } from '../components/shared/DetailPanel'
import { IndicatorControl, BaseControl, BreakdownControl, ExportBar, ChartPanel, Checkbox, Select } from '../components/shared/Controls'
import LineChart from '../components/charts/LineChart'
import { cellValue, regionValue, roundLabel, fmtValue } from '../lib/stats'
import { trendRounds, crossesBreak, segmentLabel } from '../lib/trend'
import { useChartExport, capFirst } from '../lib/useChartExport'
import { TIDY_COLUMNS_ROUNDS } from '../lib/exporter'
import { defaultIndicator, indicatorLabel, meanAllowed, meanDomain } from '../lib/indicators'

const GROUP_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']
const FEATURED = 'Core democracy & governance series'

/*
  Trends follow AB_Trend_Analysis_Instructions.md:
   - country-round estimates first; regional line = equal-weight mean over a FIXED set,
     shown only in rounds when every member has data (ab_region); an unbalanced set
     shows how many countries each point averages
   - hybrid time axis (rule 5): a country's point sits at its own fieldwork year; a regional
     point sits at the median fieldwork year of the set's countries in that round and is
     labelled with the round ("R7 (2016/18)"); a real calendar axis, nothing interpolated
   - a line breaks where a country was not surveyed or not asked in a round the question
     was asked; declared comparability breaks are never bridged and lines are drawn in
     separate segments; rounds before a declared start are not drawn (rule 6)
   - nominal questions: lines join only rounds that offered the same answer list
*/
export default function TimeSeriesExplorer() {
  const { manifest, countryName, countryColor, iso3, sortByName, fieldworkYear } = useData()
  const sourceNote = useSourceNote()
  const [params, setParams] = useSearchParams()
  const { data: index } = useResource(() => api.index(), [])
  const [itemId, setItemId] = useState(params.get('item') || manifest.default_trend)
  const entry = index?.vars.find(v => v.id === itemId)
  const { data: rec } = useResource(() => (entry ? api.variable(itemId) : null), [itemId, !!entry])
  const ready = rec && rec.id === itemId

  const [countries, setCountries] = useState([])
  const [setId, setSetId] = useState(manifest.default_set)
  const [base, setBase] = useState('valid')
  const [metric, setMetric] = useState('share')
  const [codesSel, setCodesSel] = useState([])
  const [breakdown, setBreakdown] = useState('')
  const [focus, setFocus] = useState('')
  const [showCI, setShowCI] = useState(false)
  const [fitAxis, setFitAxis] = useState(false)
  const { data: groups } = useResource(() => (ready && breakdown ? loadAllGroups(rec) : null), [ready && rec.id, !!breakdown])

  useEffect(() => { if (params.get('item') && params.get('item') !== itemId) setItemId(params.get('item')) }, [params]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (index && !entry) setItemId(manifest.default_trend) }, [index, entry]) // eslint-disable-line react-hooks/exhaustive-deps
  function chooseItem(id) { setItemId(id); setParams({ item: id }, { replace: true }) }

  useEffect(() => {
    if (!ready) return
    const d = defaultIndicator(rec, entry)
    setMetric(d.type)
    setCodesSel(d.codes || [])
    if (entry?.ds) setSetId(entry.ds)
  }, [ready && rec.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const tb = entry?.tb
  // Rounds on the line and the position used to break it: +1 per round shown, +2 across a
  // declared break or where a nominal question's answer list changes.
  const { rounds, pos, listChanges } = useMemo(() => {
    if (!ready) return { rounds: [], pos: {}, listChanges: [] }
    const rounds = trendRounds(rec.units, tb)
    const pos = {}; const listChanges = []
    let k = 0, prevSig = null
    rounds.forEach((r, i) => {
      const sig = rec.yc ? (rec.yc[r] || []).join(',') : ''
      if (i > 0) {
        k += crossesBreak(rounds[i - 1], r, tb) || sig !== prevSig ? 2 : 1
        if (sig !== prevSig) listChanges.push(r)
      }
      pos[r] = k; prevSig = sig
    })
    return { rounds, pos, listChanges }
  }, [ready, rec, tb])

  const available = useMemo(() => {
    if (!ready) return []
    const s = new Set()
    rounds.forEach(r => Object.keys(rec.est[r] || {}).forEach(c => s.add(c)))
    return sortByName([...s])
  }, [ready, rec, rounds, sortByName])

  const allowMean = ready && meanAllowed(rec, entry)
  const indicator = metric === 'mean' && allowMean ? { type: 'mean' } : { type: 'share', codes: codesSel }
  const codesKey = codesSel.join()
  const set = manifest.country_sets.find(s => s.id === setId)
  const sg = manifest.subgroups.find(s => s.id === breakdown)
  const focusKey = focus || (set ? `set:${set.id}` : countries[0] || available[0])

  const cellAt = (c, r, g = 'all') => (g === 'all' ? rec?.est?.[r]?.[c] : groups?.[r]?.[c]?.[g])
  const valueAt = (c, r, g = 'all') => {
    const cell = cellAt(c, r, g)
    const v = cell ? cellValue(cell, rec.codes, indicator, base) : null
    return v && (g === 'all' || v.n >= manifest.min_cell_n) ? v : null
  }
  const nLabel = base === 'asked' ? 'N asked' : 'N valid'
  const baseRow = { name: 'Base', value: base === 'asked' ? 'all asked' : 'valid answers' }

  const { series, regionGaps } = useMemo(() => {
    if (!ready || !rounds.length) return { series: [], regionGaps: [] }
    const countryPoint = (c, r, v) => {
      const y = fieldworkYear(c, r)
      return { x: y, y: v.value, se: v.se, n: v.n, round: r, waveIdx: pos[r], year: y,
               subtitle: `R${r} · fieldwork ${y}`, nLabel, extraRows: [baseRow] }
    }
    const regionPoints = (g) => {
      const gaps = []
      const pts = rounds.map(r => {
        const byC = Object.fromEntries(set.countries.map(c => [c, valueAt(c, r, g)]))
        const v = regionValue(byC, set.countries, !set.balanced, c => fieldworkYear(c, r))
        if (!v) { gaps.push(r); return null }
        const lab = roundLabel(r, v.year_min, v.year_max)
        return { x: v.year_mid, y: v.value, se: v.se, n: v.n, round: r, waveIdx: pos[r], year: v.year_mid, n_countries: v.n_countries,
                 roundLabel: lab, pointLabel: `R${r}`, subtitle: `${lab} · median fieldwork year ${v.year_mid}`, nLabel,
                 extraRows: [baseRow, { name: 'Countries', value: `${v.n_countries}${set.balanced ? '' : ` of ${set.countries.length}`}` }],
                 note: `${v.n_countries} countries, each weighted equally` }
      }).filter(Boolean)
      return { pts, gaps }
    }
    let series = [], regionGaps = []
    if (!breakdown) {
      const shown = countries.filter(c => available.includes(c))
      series = shown.map(c => ({
        key: c, label: countryName(c), color: countryColor(c, countries),
        points: rounds.map(r => { const v = valueAt(c, r); return v ? countryPoint(c, r, v) : null }).filter(Boolean),
      }))
      if (set) {
        const { pts, gaps } = regionPoints('all')
        regionGaps = gaps
        if (pts.length) series.push({ key: `set:${set.id}`, label: set.short || set.label, bold: true, points: pts })
      }
    } else if (groups) {
      series = sg.groups.map((g, i) => {
        let pts
        if (focusKey?.startsWith('set:')) {
          const rp = regionPoints(g.id); pts = rp.pts; regionGaps = rp.gaps
        } else {
          pts = rounds.map(r => { const v = valueAt(focusKey, r, g.id); return v ? countryPoint(focusKey, r, v) : null }).filter(Boolean)
        }
        return { key: g.id, label: g.label, color: GROUP_COLORS[i], points: pts }
      })
    }
    return { series, regionGaps }
  }, [ready, rec, rounds, pos, countries, set, base, indicator.type, codesKey, breakdown, focusKey, available, groups]) // eslint-disable-line react-hooks/exhaustive-deps

  const scaleDomain = indicator.type === 'mean' && ready ? meanDomain(rec) : [0, 100]
  const vals = series.flatMap(s => s.points.map(p => p.y))
  const yDomain = fitAxis && vals.length
    ? (indicator.type === 'mean' ? [Math.min(...vals) - 0.2, Math.max(...vals) + 0.2] : [Math.max(0, Math.min(...vals) - 5), Math.min(100, Math.max(...vals) + 5)])
    : scaleDomain
  const indLabel = ready ? indicatorLabel(indicator, rec, base) : ''
  const w0 = manifest.waves.find(w => w.id === rounds[0]), w1 = manifest.waves.find(w => w.id === rounds[rounds.length - 1])
  const roundsTxt = rounds.length ? `R${rounds[0]}–R${rounds[rounds.length - 1]} (${w0.year_min}–${w1.year_max})` : ''
  const focusLabel = focusKey?.startsWith('set:') ? (set?.short || set?.label) : countryName(focusKey)
  const setOnChart = set && (!breakdown || focusKey?.startsWith('set:'))
  const breakNote = tb ? `${tb.note} Drawn as ${segmentLabel(rec?.units || [], tb)}.` : null
  const listNote = listChanges.length ? `The list of answers offered changed in ${listChanges.map(r => `R${r}`).join(', ')}; lines join only rounds with the same list.` : null
  const note = sourceNote({
    waves: roundsTxt ? `Rounds ${roundsTxt.replace(/^R/, '').replace('–R', '–')}, ${itemId}` : '', base, hybrid: true,
    set: setOnChart ? `${set.short || set.label}: unweighted mean of ${set.countries.map(countryName).join(', ')}${set.balanced ? '; shown only in rounds when all were surveyed and asked' : '; an unbalanced set, so each point gives the number of countries averaged'}.` : null,
    extra: [breakNote, listNote, 'Lines break where a country was not surveyed or not asked; nothing is interpolated.'].filter(Boolean).join(' '),
  })

  const exp = useChartExport({
    title: entry ? capFirst(entry.q) : '', subtitle: breakdown ? `${indLabel} · ${focusLabel}, by ${sg?.label.toLowerCase()} · ${roundsTxt}` : `${indLabel} · ${roundsTxt}`,
    note, filename: `ab_trend_${itemId}${breakdown ? '_' + breakdown : ''}`, columns: TIDY_COLUMNS_ROUNDS,
    rows: () => series.flatMap(s => s.points.map(p => {
      const isSet = s.key.startsWith('set:') || (breakdown && focusKey?.startsWith('set:'))
      const cc = !isSet ? (breakdown ? focusKey : s.key) : null
      return { indicator: indLabel, variable: itemId, success_codes: indicator.codes?.join(';') ?? 'mean', base,
        country_set: isSet ? set.id : 'country', round: p.round, year: p.year, iso3: cc ? iso3(cc) : '',
        country: cc ? countryName(cc) : (set.short || set.label), group: breakdown ? s.key : 'all',
        value: p.y, se: p.se, n: p.n, n_countries: isSet ? p.n_countries : 1 }
    })),
  })

  const items = useMemo(() => (index?.vars || []).map(v => ({ id: v.id, q: capFirst(v.q), s: v.f ? FEATURED : v.s, code: v.id, t: v.t })), [index])
  const sections = useMemo(() => (index ? [FEATURED, ...index.sections] : []), [index])
  const fmt = (v, d) => fmtValue(v, indicator, d ?? (indicator.type === 'mean' ? 2 : 0))
  const xs = series.flatMap(s => s.points.map(p => p.x))
  const x0 = Math.min(w0?.year_min ?? 1999, ...xs), x1 = Math.max(w1?.year_max ?? 2025, ...xs)
  const span = x1 - x0, step = span > 14 ? 5 : span > 6 ? 2 : 1
  const xTicks = []; for (let y = Math.ceil(x0 / step) * step; y <= x1 + 0.5; y += step) xTicks.push(y)
  const minorTicks = []; for (let y = Math.floor(x0); y <= Math.ceil(x1); y++) minorTicks.push(y)
  const warnings = [
    regionGaps.length && set ? `The ${set.short || set.label} is left out of ${regionGaps.map(r => `R${r}`).join(', ')}: not every member was surveyed or asked.` : null,
    setOnChart && set && !set.balanced ? 'Unbalanced set: the countries averaged change from round to round, which can move the line by itself. See the number of countries in each tooltip and in the table.' : null,
  ].filter(Boolean)

  return (
    <div className="view-page dock-clearance">
      <div className="view-inner">
        <div className="animate-fade-up">
          <h1>Time-Series Explorer</h1>
          <p className="view-subtitle">{manifest.n_questions} harmonised questions, Rounds 1–10, on a real year axis: countries at their own fieldwork year, regional averages over fixed country sets at each round's median year.</p>
        </div>

        <div className="explorer-layout animate-fade-up stagger-1" style={{ marginTop: '1.5rem' }}>
          <div className="explorer-controls">
            {index && <VariablePicker items={items} sections={sections} value={itemId} onChange={chooseItem} label="Question" />}
            {ready && (
              <IndicatorControl allowMean={allowMean} metric={indicator.type} onMetric={setMetric}
                codes={rec.codes} labels={rec.labels} selected={codesSel} onSelected={setCodesSel}
                meanHint={entry?.ends ? `Mean on the original codes: ${entry.ends[0]} … ${entry.ends[1]}.` : rec.type === 'continuous' ? 'Mean of the exact values.' : null} />
            )}
            <BaseControl value={base} onChange={setBase} />
            <Select label="Regional average" value={setId} onChange={setSetId}
              options={[{ value: '', label: 'None' }, ...manifest.country_sets.map(s => ({ value: s.id, label: `${s.label}${s.span ? ` · ${s.span}` : ''}` }))]}
              hint={set ? `${set.countries.map(countryName).join(', ')}. Each country counts equally.${set.note ? ' ' + set.note : ''}` : null} />
            <BreakdownControl value={breakdown} onChange={v => { setBreakdown(v); setFocus('') }} />
            {breakdown && (
              <Select label="Show groups for" value={focusKey} onChange={setFocus}
                options={[...(set ? [{ value: `set:${set.id}`, label: set.short || set.label }] : []),
                          ...available.map(c => ({ value: c, label: countryName(c) }))]} />
            )}
            {!breakdown && <CountryPicker countries={available} selected={countries} onChange={setCountries} label="Countries (the regional line stays for reference)" />}
            <Checkbox checked={showCI} onChange={setShowCI} label="Show 95% confidence intervals" />
            <Checkbox checked={fitAxis} onChange={setFitAxis} label="Zoom y-axis to the data" hint={fitAxis ? 'The axis no longer starts at the bottom of the scale.' : null} />
            <ExportBar {...exp} onPrintMode={exp.setPrintMode} disabled={!series.some(s => s.points.length)}
                       printWarning={exp.printMode && series.length > 4 ? 'Print style reads best with 4 or fewer lines.' : null} />
            {entry && ready && (
              <DetailPanel code={entry.id} question={capFirst(entry.q)} section={entry.s} type={entry.t} rec={rec}
                           extra={<QuestionHistory entry={entry} rec={rec} showTrendLink={false} />} />
            )}
          </div>

          <div className="explorer-main">
            {!ready || !entry ? <div className="chart-empty"><div className="spinner" /></div>
              : breakdown && !groups ? <div className="chart-empty"><div className="spinner" /></div>
              : !series.some(s => s.points.length) ? <div className="chart-empty"><p>Choose a regional average or at least one country.</p></div>
              : (
                <ChartPanel title={capFirst(entry.q)} badge={indicator.type === 'mean' ? 'Mean' : base === 'asked' ? '% of all asked' : '% of valid answers'} note={note}
                  warning={warnings.length ? warnings.join(' ') : null}>
                  <div className="chart-subtitle">{breakdown ? `${indLabel} · ${focusLabel}, by ${sg.label.toLowerCase()}` : indLabel}</div>
                  {(entry.note || breakNote || listNote) && (
                    <p className="trend-break-note"><strong>Comparability:</strong> {[breakNote, listNote].filter(Boolean).join(' ')}{entry.note && entry.note !== tb?.note ? <>{breakNote || listNote ? ' ' : ''}{entry.note}</> : null}</p>
                  )}
                  <LineChart series={series} yDomain={yDomain} showCI={showCI} printMode={exp.printMode} svgRef={exp.svgRef}
                    xDomain={[x0 - 0.8, x1 + 0.8]} xTicks={xTicks} minorTicks={minorTicks}
                    yFormat={v => indicator.type === 'mean' ? v.toFixed(1) : `${Math.round(v)}%`} valueFormat={v => fmt(v, 1)} ariaLabel={entry.q} />
                  <TrendTable series={series} rounds={rounds} fmt={v => fmt(v, indicator.type === 'mean' ? 2 : 0)} showK={setOnChart && !set.balanced} />
                </ChartPanel>
              )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TrendTable({ series, rounds, fmt, showK }) {
  return (
    <div className="corr-table-scroll trend-table">
      <table className="corr-table">
        <thead><tr><th>Series</th>{rounds.map(r => <th key={r} className="corr-th-num">R{r}</th>)}</tr></thead>
        <tbody>
          {series.map(s => (
            <tr key={s.key} className={s.bold ? 'row-emph' : ''}>
              <td>{s.color && <span className="stat-dot" style={{ background: s.color, display: 'inline-block', marginRight: 6 }} />}{s.label}</td>
              {rounds.map(r => {
                const p = s.points.find(q => q.round === r)
                return <td key={r} className="corr-td-num" title={p ? `${p.roundLabel ?? `R${r}`}; fieldwork ${p.year}; N = ${p.n?.toLocaleString('en-US')}${p.n_countries ? `; ${p.n_countries} countries` : ''}` : 'Not surveyed / not asked'}>
                  {p ? fmt(p.y) : '—'}{p && showK && p.n_countries ? <sup> {p.n_countries}</sup> : null}
                </td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
