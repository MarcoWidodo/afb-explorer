import { useState, useEffect, useMemo, useRef } from 'react'
import { useData, useResource, useUnitVariable, useQuestionList, api, useSourceNote } from '../context/DataProvider'
import VariablePicker from '../components/shared/VariablePicker'
import DetailPanel, { QuestionHistory } from '../components/shared/DetailPanel'
import { WaveSelector, SourceToggle, IndicatorControl, BaseControl, ExportBar, ChartPanel, Select, Checkbox } from '../components/shared/Controls'
import ChoroplethMap, { COLOR_SCHEMES } from '../components/charts/ChoroplethMap'
import { cellValue, fmtValue, fmtN } from '../lib/stats'
import { useChartExport, capFirst, questionText } from '../lib/useChartExport'
import { TIDY_COLUMNS_ROUNDS } from '../lib/exporter'
import { defaultIndicator, indicatorLabel, meanAllowed } from '../lib/indicators'
import { pickRoundItem } from '../lib/roundItems'

const DEFAULT_VAR = 'dem_support'

export default function MapExplorer() {
  const { manifest, countryName, regionColor, iso3, wave: waveInfo, groupLabel, fieldworkYear } = useData()
  const sourceNote = useSourceNote()
  const [source, setSource] = useState('battery')
  const [wave, setWave] = useState(null)
  const [varId, setVarId] = useState(DEFAULT_VAR)
  const [base, setBase] = useState('valid')
  const [metric, setMetric] = useState('share')
  const [codesSel, setCodesSel] = useState([])
  const [group, setGroup] = useState('all')
  const [scheme, setScheme] = useState('Yellow → Red')
  const [flipped, setFlipped] = useState(false)

  const list = useQuestionList(source, wave)
  const entry = list?.vars.find(v => v.id === varId)
  const battery = list?.battery
  const batteryEntry = battery?.vars.find(v => v.id === varId)
  const lastEntry = useRef(null)
  useEffect(() => { if (entry) lastEntry.current = entry }, [entry])
  useEffect(() => {
    if (source === 'battery' && batteryEntry) setWave(w => (w && batteryEntry.u.includes(w) ? w : batteryEntry.u[batteryEntry.u.length - 1]))
  }, [source, batteryEntry])
  useEffect(() => {
    if (source !== 'round' || !list) return
    if (!wave) { setWave(manifest.waves[manifest.waves.length - 1].id); return }
    if (!entry) setVarId(prev => pickRoundItem(list.vars, lastEntry.current || prev, battery))
  }, [source, list, wave, entry]) // eslint-disable-line react-hooks/exhaustive-deps
  function chooseSource(s) {
    if (s === source) return
    if (s === 'round') setSource('round')
    else { const h = entry?.h?.[0]; setSource('battery'); setVarId(h && battery?.vars.some(v => v.id === h) ? h : DEFAULT_VAR) }
  }

  const { data: rec } = useUnitVariable(entry ? varId : null, wave, group !== 'all')
  const ready = rec && rec.id === varId && rec.unit === wave
  const { data: geo } = useResource(() => api.geoRegion(), [])
  useEffect(() => { if (ready) { const d = defaultIndicator(rec, entry); setMetric(d.type); setCodesSel(d.codes || []) } }, [ready && rec.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const isoByNumeric = useMemo(() => Object.fromEntries(Object.entries(manifest.countries).map(([iso, c]) => [c.iso_numeric, iso])), [manifest])
  const small = useMemo(() => new Set(Object.entries(manifest.countries).filter(([, c]) => c.small).map(([iso]) => iso)), [manifest])
  const allowMean = ready && meanAllowed(rec, entry)
  const indicator = metric === 'mean' && allowMean ? { type: 'mean' } : { type: 'share', codes: codesSel }
  const codesKey = codesSel.join()
  const values = useMemo(() => {
    if (!ready) return {}
    const out = {}
    for (const c of Object.keys(rec.est)) {
      const v = cellValue(rec.est[c][group], rec.codes, indicator, base)
      if (v && v.n >= manifest.min_cell_n) out[c] = v
    }
    return out
  }, [ready, rec, group, base, indicator.type, codesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const ranking = Object.entries(values).sort((a, b) => b[1].value - a[1].value)
  const indLabel = ready ? indicatorLabel(indicator, rec, base) : ''
  const w = waveInfo(wave)
  const roundTxt = w ? `Round ${w.id} (${w.years.replace('/', '–')})` : ''
  const fmt = (v) => fmtValue(v, indicator, indicator.type === 'mean' ? 2 : 0)
  const note = sourceNote({ waves: roundTxt, base: indicator.type === 'share' ? base : null,
    extra: [source === 'round' && entry ? `Question ${entry.code} of the Round ${wave} file.` : null, group !== 'all' ? `${groupLabel(group)} only.` : null,
            'Countries were surveyed in different years within the round; each country\'s fieldwork year is in the ranking.'].filter(Boolean).join(' ') })
  const exp = useChartExport({
    title: questionText(entry), subtitle: `${indLabel}${group !== 'all' ? ` · ${groupLabel(group)}` : ''} · ${roundTxt}`,
    note, filename: `ab_map_r${wave}_${varId}`, columns: TIDY_COLUMNS_ROUNDS,
    rows: () => ranking.map(([c, v]) => ({ indicator: indLabel, variable: varId, success_codes: indicator.codes?.join(';') ?? 'mean', base,
      country_set: 'country', round: wave, year: fieldworkYear(c, wave), iso3: iso3(c), country: countryName(c),
      group, value: v.value, se: v.se, n: v.n, n_countries: 1 })),
  })
  const items = useMemo(() => (list?.vars || []).filter(v => source === 'round' || v.u.includes(wave) || v.id === varId)
    .map(v => ({ ...v, q: capFirst(v.q) })), [list, source, wave, varId])
  const groupOptions = [{ value: 'all', label: 'All respondents' },
    ...manifest.subgroups.map(s => ({ group: s.label, options: s.groups.map(g => ({ value: g.id, label: g.label })) }))]
  const notShown = (w?.countries || []).filter(c => !values[c])
  const nBattery = battery ? battery.vars.filter(v => v.u.includes(wave)).length : null

  return (
    <div className="view-page dock-clearance">
      <div className="view-inner">
        <div className="view-header-stack animate-fade-up">
          <div>
            <h1>Map</h1>
            <p className="view-subtitle">One number per country, on a map of Africa.</p>
          </div>
          <WaveSelector value={wave} onChange={setWave} available={source === 'battery' ? batteryEntry?.u : undefined} />
        </div>
        <div className="explorer-layout animate-fade-up stagger-1" style={{ marginTop: '1.5rem' }}>
          <div className="explorer-controls">
            <SourceToggle value={source} onChange={chooseSource} unit={wave} nBattery={nBattery} nRound={w?.n_questions} />
            {list && <VariablePicker items={items} sections={list.sections} value={varId} onChange={setVarId} label="Question" />}
            {ready && <IndicatorControl allowMean={allowMean} metric={indicator.type} onMetric={setMetric} codes={rec.codes} labels={rec.labels}
                                      selected={codesSel} onSelected={setCodesSel}
                                      meanHint={entry?.ends ? `Mean on the original codes: ${entry.ends[0]} … ${entry.ends[1]}.` : null} />}
            <BaseControl value={base} onChange={setBase} />
            <Select label="Respondents" value={group} onChange={setGroup} options={groupOptions} />
            <Select label="Colour scale" value={scheme} onChange={setScheme} options={Object.keys(COLOR_SCHEMES).map(k => ({ value: k, label: k }))} />
            <Checkbox checked={flipped} onChange={setFlipped} label="Reverse colour scale" />
            <ExportBar {...exp} onPrintMode={exp.setPrintMode} disabled={!ranking.length} />
            {entry && ready && <DetailPanel code={entry.code || entry.id} question={questionText(entry)} section={entry.s} type={entry.t} rec={rec}
                                            countries={Object.keys(rec.est)} countriesLabel={`Asked in R${wave}`} extra={<QuestionHistory entry={entry} rec={rec} />} />}
          </div>
          <div className="explorer-main">
            {!ready || !geo || !entry ? <div className="chart-empty"><div className="spinner" /></div> : (
              <ChartPanel title={questionText(entry)} badge={w ? `R${w.id} · ${w.years}` : ''} note={note}>
                <div className="chart-subtitle">{indLabel}{group !== 'all' ? ` · ${groupLabel(group)}` : ''}</div>
                {entry.note && <p className="trend-break-note"><strong>Comparability:</strong> {entry.note}</p>}
                <ChoroplethMap geo={geo} values={values} isoByNumeric={isoByNumeric} countryName={countryName} scheme={scheme} flipped={flipped}
                               small={small} format={fmt} legendTitle={indLabel} printMode={exp.printMode} svgRef={exp.svgRef} ariaLabel={entry.q} />
                <div className="map-ranking">
                  <div className="detail-responses-label">Ranking</div>
                  {ranking.map(([c, v], i) => (
                    <div key={c} className="map-rank-row">
                      <span className="map-rank-num">{i + 1}</span>
                      <span className="stat-dot" style={{ background: regionColor(c) }} title={manifest.countries[c]?.subregion} />
                      <span className="map-rank-name">{countryName(c)} <span className="round-label-chip">{fieldworkYear(c, wave)}</span></span>
                      <span className="map-rank-value">{fmt(v.value)}</span>
                      <span className="map-rank-ci">{v.se != null ? `± ${fmtValue(1.96 * v.se, indicator, indicator.type === 'mean' ? 2 : 0)}` : ''}</span>
                      <span className="map-rank-n">N = {fmtN(v.n)}</span>
                    </div>
                  ))}
                  {notShown.length > 0 && (
                    <div className="map-rank-missing">Not asked{group !== 'all' ? ' or too few respondents' : ''}: {notShown.map(countryName).join(', ')}</div>
                  )}
                </div>
              </ChartPanel>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
