# Engine changes (port back to ABS and LB Explorers)

The LB Explorer was seeded from `MarcoWidodo/abs-explorer@9c4ed87` (branch `v2`). Survey-specific code
(`pipeline/R/00_config.R`, `10_catalogue.R`, `40_indicators.R`, `pipeline/config/`, the views' data loading,
text and colour tokens) is expected to differ. This file lists changes to **shared engine code** that
ABS could adopt. Each entry says whether it is backward compatible.

## AB Explorer (seeded from `MarcoWidodo/lb-explorer@2a9d59f`, 2026-10-08)

Changes to shared engine code made for Afrobarometer. Survey-specific files (`pipeline/R/00_config.R`,
`10_catalogue.R`, `40_indicators.R`, `pipeline/config/`, views' text) are expected to differ.

| # | File | Change | ABS / LB impact |
|---|---|---|---|
| A1 | `src/lib/stats.js` | `regionValue(byCountry, members, allowMissing, yearOf)`: optional `yearOf(member)` returns the member's fieldwork year; the point then carries `year_mid` (R's `median()`), `year_min`, `year_max`. New `median()`, `roundLabel()`. | Compatible. ABS can use it for its waves (restores v2's per-country years for regional points). |
| A2 | `src/lib/trend.js` (new) | Trend breaks **between adjacent units** (`tb.breaks = [[a, b], …]`) split a line into segments; `tb.start` drops earlier units. `trendPositions()` mirrors `trend_positions()` in R and is shared by the view and `check_regions.mjs`. Replaces LB's left-out break years (`tb.years`). | Schema change. LB's break years map to pairs (`1998` left out → `[1997, 1998], [1998, 2000]`, or `start`). |
| A3 | `src/views/TimeSeriesExplorer.jsx` | Hybrid time axis restored from ABS v2: country points at `countries[cc].waves[u].year`, regional points at the members' median year with a round label (`pointLabel`, drawn above the bold series by `LineChart`); tooltips show round label and fieldwork year; tidy CSV has `round` and `year`. | ABS: the same logic serves waves. LB: unit = year, so x = unit as before. |
| A4 | `src/context/DataProvider.jsx`, `CountryPicker.jsx`, `index.css` | **Colours by selection slot** (`slotColor(i)`, 16 `--slot-*` tokens; the first 8 most distinct) instead of fixed `--country-XX` tokens; outside a selection a country takes its subregion colour (`--region-*`). `countryColor(iso, selection)`. | Recommended for any survey with more than ~16 countries; ABS/LB can keep fixed tokens. |
| A5 | `src/components/shared/Controls.jsx` + CSS | `RoundSelector`: a compact 10-cell strip ("R1" … with fieldwork years) and a `<select>` under 760 px; `WaveSelector` uses the calendar `YearSelector` only when `unit_label === 'Year'` (was: more than 8 units). `SourceToggle` switches between the harmonised battery and a round's own questions. | Compatible (ABS 6 waves would also get the strip; set the threshold as wished). |
| A6 | `pipeline/build_site_data.Rmd`, `src/context/DataProvider.jsx` | **Round browser (scope B)** on the LB layout: round-file questions are catalogue entries with one unit (`id` = `R7_Q28`), so `v/`, `g/<u>/`, `r/<u>/` serve them unchanged; their catalogue is `rounds/<u>.json`. Records carry `units` (was `years`) and entries `u` (was `y`); `unitRecord()`/`useUnitVariable()` replace `yearRecord()`/`useYearVariable()`. | Schema rename; ABS could serve its wave files the same way. |
| A7 | `pipeline/R/30_correlations.R` | `weighted_cross_cor(X, Y, w)`: rectangular weighted pairwise correlations (every column of X against every column of Y); `weighted_pairwise_cor(X, w)` is now `weighted_cross_cor(X, X, w)`. Round-file questions are correlated with the battery only. The Correlations view looks a pair up in either question's file. | Compatible. |
| A8 | `pipeline/build_site_data.Rmd` | Means (`m`, `sd`, `se`) are written only where a mean is allowed (`mean_allowed()`: continuous, or 7+ point scales), so no short-scale or R10 statement-item mean exists in the data at all. | Smaller files; views already only show allowed means. |
| A9 | `src/components/charts/ChoroplethMap.jsx` | `small` prop: listed island/small states always get a marker (AB: CPV, STP, COM, MUS, SYC, GMB, SWZ, LSO), besides anything under 60 px². | Compatible. |
| A10 | `pipeline/build_site_data.Rmd` | Countries keyed by **ISO3** throughout (manifest, files, CSS), because Namibia's ISO2 code "NA" is read as missing by R and pandas defaults. CSV config is read with `na.strings = character()`. | Recommended. |
| A12 | `src/index.css`, `TimeSeriesExplorer.jsx` | Fix: numeric table headers (`.corr-th-num`) were left-aligned over right-aligned numbers, because `.corr-table thead th` outranked the class. Time-axis ticks adapt to the span (every 5, 2 or 1 years). | Bug fix; port to ABS and LB. |
| A13 | `pipeline/R/30_correlations.R` | Fix: columns are centred and scaled before the one-pass weighted sums. With large values relative to their spread (numeric items such as counts or amounts) the sums lost precision through cancellation (r off by ~3e-8 against `cov.wt` on a synthetic case; 4e-15 after). r is invariant to the transform. | Bug fix; port to ABS and LB (their items are small-valued, so the effect there was negligible). |
| A11 | `pipeline/build_site_data.Rmd` | Round files are read without their string columns (open text; R6 has undecodable bytes there) and their ID column on its own; rows are asserted to line up with the merge (ID, country, weight). | AB-specific, but the pattern applies to any raw-file browser. |

## LB Explorer (seeded from `MarcoWidodo/abs-explorer@9c4ed87`)

| # | File | Change | ABS impact |
|---|---|---|---|
| 1 | `src/lib/stats.js` | `regionValue(byCountry, members, allowMissing = false)`: optional unbalanced mode (average of members with data, `n_countries` returned). | Compatible (default unchanged). |
| 2 | `src/components/charts/LineChart.jsx` | New props `xDomain`, `xTicks`, `minorTicks` (tick marks at every survey year so gap years show); points may carry `subtitle` and `extraRows` for the tooltip (e.g. base, number of countries). | Compatible. |
| 3 | `src/components/shared/Controls.jsx` | `WaveSelector` switches to a new `YearSelector` (calendar strip with gap years, `<select>` under 760 px) when the manifest has more than 8 units; both take `available` to disable units without data. `BaseControl` text comes from `manifest.survey.nr_text`. `BreakdownControl` shows the subgroup's `note`. | Compatible (ABS has 6 waves; set `nr_text` or keep the fallback). |
| 4 | `src/lib/exporter.js` | `TIDY_COLUMNS` now follows instructions rule 9 without `wave`; `TIDY_COLUMNS_WAVES` keeps it. Values are rounded on export: shares 1 decimal, means 3 (`tidyRound`). | ABS views should pass `TIDY_COLUMNS_WAVES` to keep the `wave` column. |
| 5 | `src/lib/indicators.js` | `defaultIndicator(rec, entry)` uses the catalogue's pipeline default (`entry.d`) when present; `meanAllowed(rec, entry)` honours `entry.m`. | Compatible (falls back to the old rules). |
| 6 | `src/components/shared/WaveDotMatrix.jsx` + CSS | Dense mode for many units: calendar columns with thin gap columns, horizontal scroll inside the box on phones. | Compatible (only when > 8 units). |
| 7 | `src/components/shared/DetailPanel.jsx` | `countriesLabel` prop; new `QuestionHistory` (years asked, question number per year, comparability notes). | Compatible. |
| 8 | `src/components/layout/Header.jsx` + CSS | Optional banner from `manifest.survey.preview_notice`. | Compatible. |
| 9 | `src/context/DataProvider.jsx` | `useSourceNote({ gaps })` appends `manifest.gaps_note`; base wording from `nr_text`; `unit` / `years` helpers; `waveLabel` drops the year range when the unit is a year. Data paths are LB's layout (below). | Paths are survey-specific; the helpers are compatible. |
| 10 | `src/views/CorrelationsExplorer.jsx` | Across-country scatter plots each question's **default summary** (a mean only for interval-like scales, else the top-category share), not always the mean, per instructions rule 7. | Recommended for ABS too (it plotted means of 4-point items). |
| 11 | `pipeline/build_site_data.Rmd` | A country-year in which every answer is nonresponse is **not published** (it is a question not asked there, e.g. armed forces in Costa Rica/Panama). Listed in `output/nonresponse_only_country_years.csv`. | Worth checking ABS for the same pattern. |
| 12 | `pipeline/build_site_data.Rmd` | Subgroup cells are slimmed (no per-code counts or SD; Kish N rounded) and stored one file per year; correlation files store pairwise N as `n0` (valid N of the focal item) minus `dn`. Cuts payload by about a third. | Schema change; ABS front end reads the old fields. |
| 13 | `pipeline/R/10_catalogue.R` (LB) | 0–10 / 1–10 scales labelled only at the ends are ordinal even when the end labels are not scale words ("Left" … "Right"). | Same rule would be safe in ABS. |

## Data layout (LB)

LB variables are harmonised across years, so one file per question covers every year:
`v/<var>.json` (all respondents, all years; trends, map and single-year view share one fetch),
`g/<year>/<var>.json` (subgroups, on demand), `r/<year>/index.json` + `r/<year>/<var>.json` (correlations),
`index.json` (catalogue with years, type, default indicator, comparability notes).
