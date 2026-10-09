import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData, useUnitVariable, useQuestionList, isRoundItem, useSourceNote } from '../context/DataProvider'
import VariablePicker from '../components/shared/VariablePicker'
import CountryPicker from '../components/shared/CountryPicker'
import DetailPanel, { QuestionHistory } from '../components/shared/DetailPanel'
import { WaveSelector, SourceToggle, IndicatorControl, BaseControl, BreakdownControl, ExportBar, ChartPanel, Checkbox } from '../components/shared/Controls'
import BarChart from '../components/charts/BarChart'
import DotPlot from '../components/charts/DotPlot'
import { cellValue, cellDistribution, fmtValue, fmtN } from '../lib/stats'
import { useChartExport, capFirst, questionText } from '../lib/useChartExport'
import { TIDY_COLUMNS_ROUNDS } from '../lib/exporter'
import { defaultIndicator, indicatorLabel, meanAllowed, meanDomain, MAX_BARS } from '../lib/indicators'
import { pickRoundItem } from '../lib/roundItems'

const PREFERRED = ['NGA', 'ZAF', 'KEN', 'GHA']
const DEFAULT_VAR = 'dem_support'
const GROUP_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export default function SingleWaveExplorer() {
  const { manifest, unit, countryName, countryColor, waveCountries, iso3, fieldworkYear } = useData()
  const sourceNote = useSourceNote()
  const [params, setParams] = useSearchParams()
  const q0 = params.get('q') || DEFAULT_VAR
  const [source, setSource] = useState(isRoundItem(q0) ? 'round' : 'battery')
  const [varId, setVarId] = useState(q0)
  const [wave, setWave] = useState(isRoundItem(q0) ? Number(q0.match(/^R(\d+)_/)[1]) : null)
  const [countries, setCountries] = useState([])
  const [base, setBase] = useState('valid')
  const [breakdown, setBreakdown] = useState('')
  const [metric, setMetric] = useState('share')
  const [codesSel, setCodesSel] = useState([])
  const [showCI, setShowCI] = useState(false)

  const list = useQuestionList(source, wave)
  const entry = list?.vars.find(v => v.id === varId)
  const battery = list?.battery
  const batteryEntry = battery?.vars.find(v => v.id === varId)
  const lastEntry = useRef(null)
  useEffect(() => { if (entry) lastEntry.current = entry }, [entry])

  // battery: keep the chosen round if the question was asked then, else its latest round
  useEffect(() => {
    if (source !== 'battery' || !batteryEntry) return
    setWave(w => (w && batteryEntry.u.includes(w) ? w : batteryEntry.u[batteryEntry.u.length - 1]))
  }, [source, batteryEntry])
  useEffect(() => { if (source === 'battery' && battery && !batteryEntry) setVarId(DEFAULT_VAR) }, [source, battery, batteryEntry])
  // round files: a question from this round's file (the same battery item or variable name if there is one)
  useEffect(() => {
    if (source !== 'round' || !list) return
    if (!wave) { setWave(manifest.waves[manifest.waves.length - 1].id); return }
    if (!entry) setVarId(prev => pickRoundItem(list.vars, lastEntry.current || prev, battery))
  }, [source, list, wave, entry]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: rec, loading } = useUnitVariable(entry ? varId : null, wave, !!breakdown)
  const ready = rec && rec.id === varId && rec.unit === wave
  function chooseVar(id) { setVarId(id); setParams({ q: id }, { replace: true }) }
  function chooseSource(s) {
    if (s === source) return
    if (s === 'round') {
      setSource('round')                         // the effect above picks this item's source variable
    } else {
      const h = entry?.h?.[0]
      setSource('battery'); setVarId(h && battery?.vars.some(v => v.id === h) ? h : DEFAULT_VAR)
    }
  }

  const asked = useMemo(() => (ready ? Object.keys(rec.est) : []), [ready, rec])
  useEffect(() => {
    if (!ready) return
    setCountries(prev => {
      const keep = prev.filter(c => asked.includes(c))
      if (keep.length) return keep
      return PREFERRED.filter(c => asked.includes(c)).concat(asked).filter((c, i, a) => a.indexOf(c) === i).slice(0, 4)
    })
  }, [ready, asked.join()]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return
    const d = defaultIndicator(rec, entry)
    setMetric(d.type)
    setCodesSel(d.codes || [])
  }, [ready && rec.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const allowMean = ready && meanAllowed(rec, entry)
  const indicator = metric === 'mean' && allowMean ? { type: 'mean' } : { type: 'share', codes: codesSel }
  const shown = countries.filter(c => ready && rec.est?.[c])
  const shownKey = shown.join()
  const scaleNote = entry?.ends ? `${entry.ends[0]} … ${entry.ends[1]}` : null
  const colorOf = (c) => countryColor(c, countries)

  /* ── distribution (no breakdown) ── */
  const dist = useMemo(() => {
    if (!ready) return null
    const byCountry = Object.fromEntries(shown.map(c => [c, cellDistribution(rec.est[c].all, rec, base)]))
    const catsAll = []
    const seen = new Set()
    const labelOf = (code, nr) => nr ? rec.nr_labels[rec.nr.indexOf(code)] : rec.labels[rec.codes.indexOf(code)] ?? String(code)
    shown.forEach(c => byCountry[c]?.forEach(d => {
      const key = `${d.nr ? 'nr' : 'c'}${d.code}`
      if (!seen.has(key)) { seen.add(key); catsAll.push({ key, code: d.code, nr: d.nr, label: labelOf(d.code, d.nr) }) }
    }))
    const order = (a) => a.nr ? 1e6 + rec.nr.indexOf(a.code) : rec.codes.indexOf(a.code)
    catsAll.sort((a, b) => order(a) - order(b))
    // answers offered elsewhere but not in these countries this round are left out
    const used = rec.type !== 'nominal' ? catsAll : catsAll.filter(c => c.nr || shown.some(cc => byCountry[cc]?.find(d => !d.nr && d.code === c.code && (d.count ?? 1) > 0)))
    let cats = used
    let other = null
    if (used.length > MAX_BARS) {  // nominal items with long code lists: largest categories + "Other"
      const peak = (k) => Math.max(...shown.map(c => byCountry[c]?.find(d => `${d.nr ? 'nr' : 'c'}${d.code}` === k)?.pct ?? 0))
      const top = new Set([...used].filter(c => !c.nr).sort((a, b) => peak(b.key) - peak(a.key)).slice(0, MAX_BARS - 1).map(c => c.key))
      cats = used.filter(c => top.has(c.key) || c.nr)
      other = used.filter(c => !top.has(c.key) && !c.nr).map(c => c.key)
      cats.splice(cats.findIndex(c => c.nr) >= 0 ? cats.findIndex(c => c.nr) : cats.length, 0, { key: '_other', label: `All other answers (${other.length})`, code: null })
    }
    const get = (c, k) => {
      const l = byCountry[c]
      if (!l) return null
      if (k === '_other') return { value: l.filter(d => other.includes(`${d.nr ? 'nr' : 'c'}${d.code}`)).reduce((s, d) => s + d.pct, 0) }
      const d = l.find(x => `${x.nr ? 'nr' : 'c'}${x.code}` === k)
      return d ? { value: d.pct, count: d.count } : { value: 0, count: 0 }
    }
    return { cats: cats.map(c => ({ ...c, muted: c.nr })), get }
  }, [ready, rec, shownKey, base]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── indicator per country × group ── */
  const valueOf = (c, g = 'all') => cellValue(rec?.est?.[c]?.[g], rec?.codes, indicator, base)
  const sg = manifest.subgroups.find(s => s.id === breakdown)
  const indLabel = ready ? indicatorLabel(indicator, rec, base) : ''
  const w = manifest.waves.find(x => x.id === wave)
  const roundTxt = w ? `Round ${w.id} (${w.years.replace('/', '–')})` : ''
  const groupNote = breakdown ? `Subgroups with fewer than ${manifest.min_cell_n} respondents are not shown.` : undefined
  const srcNote = source === 'round' && entry ? `Question ${entry.code} of the Round ${wave} file.` : null
  const note = sourceNote({ waves: roundTxt, base: indicator.type === 'share' || !breakdown ? base : null, extra: [srcNote, groupNote].filter(Boolean).join(' ') || undefined })

  const exp = useChartExport({
    title: questionText(entry),
    subtitle: breakdown ? `${indLabel}, by ${sg?.label.toLowerCase()} · ${roundTxt}` : `% of respondents · ${roundTxt}`,
    note, filename: `ab_r${wave}_${varId}${breakdown ? '_' + breakdown : ''}`, columns: TIDY_COLUMNS_ROUNDS,
    rows: () => {
      if (!ready) return []
      const rows = []
      if (!breakdown) {
        shown.forEach(c => cellDistribution(rec.est[c].all, rec, base)?.forEach(d => rows.push({
          indicator: d.nr ? rec.nr_labels[rec.nr.indexOf(d.code)] : rec.labels[rec.codes.indexOf(d.code)], variable: varId,
          success_codes: String(d.code), base, country_set: 'country', round: wave, year: fieldworkYear(c, wave),
          iso3: iso3(c), country: countryName(c), group: 'all', value: d.pct,
          n: base === 'asked' ? rec.est[c].all.n : rec.est[c].all.nv, n_countries: 1 })))
      } else {
        shown.forEach(c => ['all', ...sg.groups.map(g => g.id)].forEach(g => {
          const v = valueOf(c, g)
          if (v && (g === 'all' || v.n >= manifest.min_cell_n)) rows.push({ indicator: indLabel, variable: varId,
            success_codes: indicator.codes?.join(';') ?? 'mean', base, country_set: 'country', round: wave, year: fieldworkYear(c, wave),
            iso3: iso3(c), country: countryName(c), group: g, value: v.value, se: v.se, n: v.n, n_countries: 1 })
        }))
      }
      return rows
    },
  })

  const items = useMemo(() => (list?.vars || []).filter(v => source === 'round' || v.u.includes(wave) || v.id === varId)
    .map(v => ({ ...v, q: capFirst(v.q) })), [list, source, wave, varId])
  const nBattery = battery ? battery.vars.filter(v => v.u.includes(wave)).length : null
  const nRound = w?.n_questions ?? null

  return (
    <div className="view-page dock-clearance">
      <div className="view-inner">
        <div className="view-header-stack animate-fade-up">
          <div>
            <h1>Single-{unit} Explorer</h1>
            <p className="view-subtitle">Answers to any question in any round, compared across countries and groups: the harmonised battery, or every question in a round's own file.</p>
          </div>
          <WaveSelector value={wave} onChange={setWave} available={source === 'battery' ? batteryEntry?.u : undefined} />
        </div>

        <div className="explorer-layout animate-fade-up stagger-1" style={{ marginTop: '1.5rem' }}>
          <div className="explorer-controls">
            <SourceToggle value={source} onChange={chooseSource} unit={wave} nBattery={nBattery} nRound={nRound} />
            {list && <VariablePicker items={items} sections={list.sections} value={varId} onChange={chooseVar} label="Question" />}
            {ready && (
              <IndicatorControl allowMean={allowMean} metric={indicator.type} onMetric={setMetric}
                codes={rec.codes} labels={rec.labels} selected={codesSel} onSelected={setCodesSel}
                meanHint={rec.type === 'continuous' ? 'Mean of the exact values.' : scaleNote ? `Mean on the original codes: ${scaleNote}. Off-scale answers excluded.` : null} />
            )}
            <BaseControl value={base} onChange={setBase} />
            <BreakdownControl value={breakdown} onChange={setBreakdown} />
            {breakdown && <Checkbox checked={showCI} onChange={setShowCI} label="Show 95% confidence intervals" />}
            <CountryPicker countries={waveCountries(wave)} available={asked} selected={countries} onChange={setCountries} />
            <ExportBar {...exp} onPrintMode={exp.setPrintMode} disabled={!ready || !shown.length}
                       printWarning={exp.printMode && shown.length > 4 && !breakdown ? 'Print style reads best with 4 or fewer countries.' : null} />
            {entry && ready && (
              <DetailPanel code={entry.code || entry.id} question={questionText(entry)} section={entry.s} type={entry.t} rec={rec}
                           countries={asked} countriesLabel={`Asked in R${wave}`}
                           extra={<QuestionHistory entry={entry} rec={rec} />} />
            )}
          </div>

          <div className="explorer-main">
            {!ready || !entry ? (
              <div className="chart-empty"><div className="spinner" /></div>
            ) : !shown.length ? (
              <div className="chart-empty"><p>Choose at least one country where this question was asked in Round {wave}.</p></div>
            ) : (
              <ChartPanel title={questionText(entry)} badge={w ? `R${w.id} · ${w.years}` : ''} note={note}
                          warning={loading ? null : entry.t === 'nominal' && dist?.cats.some(c => c.key === '_other') ? `Showing the ${MAX_BARS - 1} most common answers; the rest are grouped.` : null}>
                {entry.note && <p className="trend-break-note"><strong>Comparability:</strong> {entry.note}</p>}
                {!breakdown ? (
                  <BarChart categories={dist.cats} series={shown.map(c => ({ key: c, label: countryName(c), color: colorOf(c) }))}
                            get={dist.get} printMode={exp.printMode} svgRef={exp.svgRef} ariaLabel={entry.q} />
                ) : (
                  <DotPlot rows={shown.map(c => ({ key: c, label: countryName(c) }))}
                           groups={sg.groups.map((g, i) => ({ key: g.id, label: g.label, color: GROUP_COLORS[i] }))}
                           get={(c, g) => valueOf(c, g)} overall={c => valueOf(c)?.value}
                           domain={indicator.type === 'mean' ? meanDomain(rec) : [0, 100]}
                           format={(v, tick) => fmtValue(v, indicator, tick ? 0 : indicator.type === 'mean' ? 2 : 0)}
                           showCI={showCI} printMode={exp.printMode} svgRef={exp.svgRef} minN={manifest.min_cell_n} ariaLabel={entry.q} />
                )}
                <div className="stats-row">
                  {shown.map(c => {
                    const v = valueOf(c)
                    return (
                      <div key={c} className="stat-card">
                        <div className="stat-country"><span className="stat-dot" style={{ background: colorOf(c) }} />{countryName(c)} <span className="round-label-chip">{fieldworkYear(c, wave)}</span></div>
                        <div className="stat-values">
                          <span className="stat-mean">{v ? fmtValue(v.value, indicator, indicator.type === 'mean' ? 2 : 0) : '—'}</span>
                          {v?.se != null && <span className="stat-std">± {fmtValue(1.96 * v.se, indicator, indicator.type === 'mean' ? 2 : 0)}</span>}
                        </div>
                        <div className="stat-n">{indLabel.length > 42 ? indLabel.slice(0, 40) + '…' : indLabel} · N = {fmtN(v?.n)}</div>
                      </div>
                    )
                  })}
                </div>
              </ChartPanel>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
