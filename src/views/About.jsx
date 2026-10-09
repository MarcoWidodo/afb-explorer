import { useData, useResource, api } from '../context/DataProvider'
import { segmentLabel } from '../lib/trend'

export default function About() {
  const { manifest, countryName } = useData()
  const { data: index } = useResource(() => api.index(), [])
  const s = manifest.survey
  const totalN = manifest.waves.reduce((a, w) => a + w.n, 0)
  const notes = (index?.vars || []).filter(v => v.note || v.tb)
  const first = manifest.waves[0], last = manifest.waves[manifest.waves.length - 1]

  return (
    <div className="view-page dock-clearance">
      <div className="about">
        <h1>About the data</h1>
        <p className="view-subtitle">How every number on this site is produced, so that it can be checked and reproduced.</p>

        <section>
          <h2>What is here</h2>
          <p>
            {s.name} Rounds {first.id}–{last.id} ({first.year_min}–{last.year_max}), {Object.keys(manifest.countries).length} African countries,{' '}
            {totalN.toLocaleString('en-US')} interviews. Two kinds of question:
          </p>
          <ul className="about-list">
            <li><strong>The harmonised battery</strong>: {manifest.n_questions} questions recoded to one scale across rounds (democracy, statement items,
              freedoms, trust, corruption, government performance, the economy, lived poverty, participation, the media, demographics, and AB's demand
              and supply of democracy indices), each asked in at least three rounds. These are the only numbers used for trends.</li>
            {manifest.round_files && <li><strong>Every question in the round files</strong>: {manifest.n_round_questions.toLocaleString('en-US')} questions
              from <code>Wave 1.sav</code> … <code>Wave 10.sav</code>, each with its own round's wording and answer codes, in the single-round
              view, the map and the correlations. Identifiers, interview administration, weights and open-ended text are left out.</li>}
          </ul>
          <div className="corr-table-scroll">
            <table className="about-table">
              <thead><tr><th>Round</th><th>Fieldwork</th><th className="num">Interviews</th><th className="num">Countries</th>
                {manifest.round_files && <th className="num">Questions in the file</th>}</tr></thead>
              <tbody>
                {manifest.waves.map(w => (
                  <tr key={w.id}><td>{w.label}</td><td>{w.years.replace('/', '–')}</td><td className="num">{w.n.toLocaleString('en-US')}</td>
                    <td className="num">{w.countries.length}</td>{manifest.round_files && <td className="num">{w.n_questions}</td>}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            The battery comes from <code>AB_HarmonizedMerge_v1.sav</code>, a merge of the ten round files driven entirely by a reviewed crosswalk
            (every source code mapped explicitly; every judgement call approved on 8 October 2026) and audited respondent by respondent against the
            round files by an independent script: every respondent appears once with the source weight, no source code maps to two merged codes, and
            the merge reproduces Afrobarometer's published 2024/2025 averages to within 0.4 points.
          </p>
        </section>

        <section>
          <h2>How the numbers are computed</h2>
          <dl className="about-defs">
            <dt>Weights</dt>
            <dd>Every percentage and mean uses the within-country weight built at enumeration-area level (<code>weight</code>: <code>withinwt</code> in
              Rounds 1–7, <code>withinwt_ea</code> in Rounds 8–10), the only method available in all ten rounds. It corrects the sample's composition inside
              a country and says nothing about the relative size of countries. Afrobarometer's own published Round 10 country figures use the newer
              household-level weight (<code>withinwt_hh</code>, Rounds 8–10 only): country values can differ from this site's by up to about 2 points,
              averages over many countries by at most 0.4. Sample sizes (N) are unweighted counts.</dd>
            <dt>Denominator</dt>
            <dd><strong>Valid answers</strong> (the default) leaves out "don't know", "refused" and "missing". <strong>All asked</strong> keeps them in the
              base, as Afrobarometer publishes: for example, 64% of respondents in the 38 Round 10 countries say democracy is preferable to any other
              kind of government. Respondents for whom a question did not apply or who were not asked it are never counted. "Don't know" on support for
              democracy is 11–16% in Rounds 2, 3 and 6 (36% in Sierra Leone in Round 6), so an all-asked trend dips in those rounds for that reason alone.</dd>
            <dd>In the battery, −1 don't know, −2 refused and −5 missing are non-response (shown as one category); −3 not applicable and −4 not asked
              are out of both bases. Valid answers off the scale keep positive codes: 91 "agree with neither" (statement items), 92 "the country is not
              a democracy" (satisfaction), 93 "a democracy, extent not specified" (Round 1) and 94 "No" (Round 10 participation items). They count in
              percentages but never in means. A country-round in which every answer is non-response (for example a country where an item was not
              fielded) is left out rather than shown as 0%.</dd>
            {manifest.round_files && <dd>In the round files, missing codes are positive and vary by item (7/8/9, 98/99, 998/999, −1). For every variable the
              crosswalk maps into the battery, the reviewed crosswalk decides which codes are non-response or not asked, so those questions have
              exactly the battery's N. Every other code is classified by its label ("Don't know", "Refused", "Missing", "Not applicable", "No contact",
              "Agree with neither", …), and system-missing values count as not asked. Every classification is listed in the pipeline's
              <code> round_code_review.csv</code>.</dd>}
            <dt>Means</dt>
            <dd>Afrobarometer's answer scales have 3 to 5 points, so the site shows the share in the top categories instead of a mean (for example
              "somewhat + a lot" of trust). Means are offered only for numeric questions such as age and for interval-like scales of 7 or more points,
              always with the meaning of the end points. Round 10 statement items have no "very strongly" option, so only the share choosing the
              pro-democratic statement is comparable; they never get a mean.</dd>
            <dt>Uncertainty</dt>
            <dd>95% confidence intervals are ±1.96 standard errors, using the Kish effective sample size of the weights. The data carry no cluster or
              stratum identifiers, so true intervals are somewhat wider. Country samples are about 1,200 (±2.8 points for a 50% share) or 2,400 (±2.0),
              so a single-country change of less than about 5 points between two rounds should not be read as a change without a proper test. A 17- or
              28-country average is much more precise (roughly ±1 point).</dd>
            <dt>Subgroups</dt>
            <dd>From the merge, so identical in every round: gender; age (under 30, 30–44, 45–59, 60+); education in four groups (no formal schooling,
              primary, secondary, post-secondary); and urban or rural primary sampling unit. Groups with fewer than {manifest.min_cell_n} respondents are not shown.</dd>
            <dt>Regional averages</dt>
            <dd>The unweighted mean of the country estimates, so every country counts equally (as Afrobarometer does), over a fixed set of countries; a
              round is shown only when every member was surveyed and asked, as in <code>ab_region()</code>. A pooled "Africa" figure (all respondents in one
              pot) would let the growing and changing panel move the line, so it is not used for trends. The sets:
              <ul className="about-list">
                {manifest.country_sets.map(cs => <li key={cs.id}><strong>{cs.label}</strong>{cs.span ? ` (${cs.span})` : ''}: {cs.countries.length > 30 ? 'every country surveyed in the round' : cs.countries.map(countryName).join(', ')}.{cs.note ? ` ${cs.note}` : ''}</li>)}
              </ul>
            </dd>
            <dt>Time axis</dt>
            <dd>Countries within a round were surveyed in different calendar years, and rounds overlap (Round 8: 2019–21; Round 9: 2021–23). The axis is
              therefore hybrid: a country's point sits at its own fieldwork year (the median interview year; Round 1 years from Afrobarometer Working
              Paper 98), and a regional point sits at the median fieldwork year of the set's countries in that round, labelled with the round
              ("R7 (2016/18)"). No country was surveyed twice in one year. Lines break where a country was not surveyed or not asked in a round the
              question was asked elsewhere; nothing is interpolated.</dd>
            <dt>Comparability breaks</dt>
            <dd>Where a question's wording or answers changed, the trend line is drawn in separate segments that are never joined (for example media
              freedom: R3 | R4 | R5–R7 | R8–R10), and trust trends start in Round 3 because Rounds 1 and 2 used different answer wordings. The full list is below.</dd>
            <dt>Correlations</dt>
            <dd><strong>Within a country:</strong> weighted Pearson correlation among respondents who answered both questions in that country-round, on the
              original answer codes (on-scale answers only), with a two-sided t-test on the unweighted N. Battery items are correlated with each other;
              each round-file question is correlated with every battery item asked in its round. <strong>Across countries:</strong> the Pearson correlation of
              the countries' values (the default summary of each question), one point per country.</dd>
            <dt>Exports</dt>
            <dd>Every chart exports as SVG, a 300-dpi PNG (9 × 5.5 in) and a tidy CSV of exactly the plotted values, with the columns <code>indicator,
              variable, success_codes, base, country_set, round, year, iso3, country, group, value, se, n, n_countries</code> (year = the fieldwork year
              the point is drawn at). The greyscale print style tells series apart by line type and marker shape, as in the project's slides.</dd>
          </dl>
        </section>

        {notes.length > 0 && (
          <section>
            <h2>Comparability notes</h2>
            <p>From the crosswalk and the audit of the merge. Each note also appears with its question.</p>
            <table className="about-table about-small">
              <tbody>{notes.map(v => <tr key={v.id}><td><code>{v.id}</code></td><td>{v.q}</td>
                <td>{[v.tb ? `${v.tb.note} Drawn as ${segmentLabel(v.u, v.tb)}.` : null, v.note && v.note !== v.tb?.note ? v.note : null].filter(Boolean).join(' ')}</td></tr>)}</tbody>
            </table>
          </section>
        )}

        <section>
          <h2>Terms of use</h2>
          <p>
            Afrobarometer data are copyrighted. Afrobarometer asks users to cite the data as "Afrobarometer Data, [Country(ies)], [Round(s)], [Year(s)],
            available at http://www.afrobarometer.org" and to send copies of publications that use them. Its data-use page has no explicit clause on
            redistributing data or aggregates. This site publishes only aggregate estimates (weighted percentages, means and correlations by country and
            round), never respondent-level data, and is a private preview for the research team: it should not be made public until Afrobarometer has
            agreed to a public release. Afrobarometer's own online analysis tool, which shows one round at a time, is at{' '}
            <a href="https://www.afrobarometer.org/online-data-analysis/" target="_blank" rel="noopener noreferrer">afrobarometer.org/online-data-analysis</a>.
          </p>
        </section>

        <section>
          <h2>Source and citation</h2>
          <p>{s.citation} {s.attribution}</p>
          <p className="about-small">Site data built {manifest.built} from:</p>
          <table className="about-table about-small">
            <tbody>{manifest.sources.map(f => <tr key={f.file}><td><code>{f.file}</code></td><td><code>{f.md5}</code></td></tr>)}</tbody>
          </table>
          <p className="about-small">Questions or errors: <a href={`mailto:${s.contact}`}>{s.contact}</a>.</p>
        </section>
      </div>
    </div>
  )
}
