import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useData } from '../../context/DataProvider'
import { TYPE_LABEL } from './VariablePicker'
import { segmentLabel } from '../../lib/trend'

/**
 * Collapsible "Question details" panel used by every view.
 * rec: a variable file ({ codes, labels, nr, nr_labels, offscale }) or a trend item.
 */
export default function DetailPanel({ title = 'Question details', code, question, section, type, rec, countries, countriesLabel = 'Asked in', harmonized, extra, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const { countryName } = useData()
  if (!question) return null
  const off = new Set(rec?.offscale || [])
  return (
    <div className="detail-panel">
      <button className="detail-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="detail-toggle-text">{title}{code ? <span className="detail-toggle-code"> · {code}</span> : null}</span>
        <ChevronDown size={15} style={{ transition: 'transform 0.25s ease', transform: open ? 'rotate(180deg)' : 'none', color: 'var(--color-text-tertiary)' }} />
      </button>
      {open && (
        <div className="detail-content animate-fade-in">
          <div className="detail-question">{question}</div>
          <div className="detail-meta">
            {section && <span className="detail-tag">{section}</span>}
            {type && <span className="detail-tag">{TYPE_LABEL[type] || type}</span>}
            {rec?.codes && type !== 'continuous' && <span className="detail-tag">{rec.codes.length - off.size} {type === 'nominal' ? 'answers' : 'scale points'}</span>}
          </div>
          {rec?.codes && (
            <div className="detail-responses">
              <div className="detail-responses-label">{type === 'continuous' ? 'Bins used for the chart' : 'Answers'}</div>
              {rec.codes.slice(0, 60).map((c, i) => (
                <div key={c} className="detail-response-row">
                  <span className="detail-response-code">{type === 'continuous' ? '' : c}</span>
                  <span className="detail-response-label">{rec.labels[i]}</span>
                  {off.has(c) && <span className="detail-nr-badge" title="Valid answer that is not on the scale: counted in percentages, not in means">off-scale</span>}
                </div>
              ))}
              {rec.codes.length > 60 && <div className="detail-response-row"><span className="detail-response-label">…and {rec.codes.length - 60} more</span></div>}
              {rec.nr?.map((c, j) => (
                <div key={`nr${c}`} className="detail-response-row non-response">
                  <span className="detail-response-code">{c}</span>
                  <span className="detail-response-label">{rec.nr_labels?.[j] ?? 'No answer'}</span>
                  <span className="detail-nr-badge">non-response</span>
                </div>
              ))}
              {type === 'continuous' && rec.range && (
                <div className="detail-note">Observed range {rec.range[0]}–{rec.range[1]}. Means use exact values, not bins.</div>
              )}
            </div>
          )}
          {countries && (
            <div className="detail-note"><strong>{countriesLabel}:</strong> {countries.map(countryName).join(', ')}</div>
          )}
          {harmonized && (
            <div className="detail-note">
              Also part of the harmonized series <Link to={`/trends?item=${harmonized}`} className="detail-link">{harmonized}</Link>, comparable across waves.
            </div>
          )}
          {extra}
        </div>
      )}
    </div>
  )
}

/**
 * Afrobarometer battery item history: wording, the source variable in each round's file
 * (from the crosswalk), comparability notes, how the trend line is segmented, the judgement
 * calls approved for the merge, and a link to the trend.
 */
export function QuestionHistory({ entry, rec, showTrendLink = true }) {
  if (!entry) return null
  if (entry.code && entry.id !== entry.code) return <RoundItemHistory entry={entry} rec={rec} />
  const src = rec?.src || {}
  const units = entry.u || []
  // group identical judgement-call notes across rounds: "R2–R10: …"
  const jcs = []
  Object.entries(rec?.jc || {}).forEach(([r, note]) => {
    const last = jcs[jcs.length - 1]
    if (last && last.note === note) last.rounds.push(Number(r)); else jcs.push({ note, rounds: [Number(r)] })
  })
  const span = (rs) => (rs.length > 1 ? `R${rs[0]}–R${rs[rs.length - 1]}` : `R${rs[0]}`)
  return (
    <>
      {rec?.wording && <div className="detail-note"><strong>Wording:</strong> {rec.wording}</div>}
      {entry.note && <div className="detail-note"><strong>Comparability:</strong> {entry.note}</div>}
      {entry.tb && <div className="detail-note"><strong>Trend:</strong> {entry.tb.note} Drawn as {segmentLabel(units, entry.tb)}.</div>}
      <div className="detail-responses-label" style={{ marginTop: '0.75rem' }}>Asked in {units.length} rounds · variable in each round's file</div>
      <div className="detail-qn-grid">
        {units.map(u => (
          <span key={u} className="detail-qn"><span className="detail-response-code">R{u}</span><span className="detail-source-var">{src[u] ?? '—'}</span></span>
        ))}
      </div>
      {jcs.length > 0 && (
        <>
          <div className="detail-responses-label" style={{ marginTop: '0.5rem' }}>Judgement calls in the merge (approved 2026-10-08)</div>
          {jcs.map((j, i) => <div key={i} className="detail-jc"><span className="detail-response-code">{span(j.rounds)}</span> {j.note}</div>)}
        </>
      )}
      {!src || !Object.keys(src).length ? <div className="detail-note">Derived in the merge from the battery items (AB's R10 definition), in every round where all its parts were asked.</div> : null}
      {showTrendLink && (
        <div className="detail-note">See this question over time in the <Link to={`/trends?item=${entry.id}`} className="detail-link">Time-Series Explorer</Link>.</div>
      )}
    </>
  )
}

/** A question from one round's own file (scope B). */
export function RoundItemHistory({ entry, rec }) {
  const { manifest } = useData()
  const round = rec?.round ?? Number(String(entry.id).match(/^R(\d+)_/)?.[1])
  const w = manifest.waves.find(x => x.id === round)
  return (
    <>
      <div className="detail-note"><strong>Source:</strong> variable <code>{entry.code}</code> in the Round {round} file{w ? ` (fieldwork ${w.years.replace('/', '–')})` : ''}{rec?.label ? <>, labelled “{rec.label}”</> : null}.</div>
      <div className="detail-note">Answer codes are the round file's own. Don't know, refused and missing are shown as one category; not applicable and not asked are left out of both bases.</div>
      {entry.h?.length > 0 && (
        <div className="detail-note">
          Harmonised across rounds as {entry.h.map((h, i) => <span key={h}>{i ? ', ' : ''}<Link to={`/trends?item=${h}`} className="detail-link">{h}</Link></span>)}:
          comparable over time in the Time-Series Explorer (the battery may recode or reverse the answers).
        </div>
      )}
    </>
  )
}
