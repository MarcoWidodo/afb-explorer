# Afrobarometer Explorer

Interactive explorer for Afrobarometer Rounds 1–10 (1999–2025, 45 African countries). It adds what Afrobarometer's own online tool (one round at a time) lacks: harmonised trends across rounds on a hybrid round/year axis, equal-weight regional averages over fixed country sets, subgroup breakdowns, every question in the ten round files, maps and correlations, and print-ready greyscale exports with tidy CSVs.

**Status: private preview.** Afrobarometer data are copyrighted, and its data-use page has no explicit clause on redistributing aggregates. The site carries a preview banner and `noindex`, and the Vercel deployment sits behind Vercel Authentication; write to Afrobarometer before any public release. (This GitHub repository, `MarcoWidodo/afb-explorer`, is public by Marco's choice, 2026-10-08: it holds aggregate estimates only, never microdata.)

Third site on the barometer-explorer engine: seeded from the Latinobarómetro Explorer v1 (`MarcoWidodo/lb-explorer@2a9d59f`), itself seeded from the ABS Explorer v2. Changes to shared engine code are logged in [`ENGINE_CHANGES.md`](ENGINE_CHANGES.md) so they can be ported back.

The site is a static React app. **Every number it shows is computed in R** by `pipeline/build_site_data.Rmd` and written to `public/data/` as small JSON files. The browser only fetches the files a view needs.

```
pipeline/                    R pipeline → public/data (knit this to rebuild the data)
  build_site_data.Rmd        the build, with every check as a stopifnot()
  R/00_config.R              everything survey-specific: paths, rounds, weight, subgroups, country sets, round-file admin rules
  R/10_catalogue.R           response-code and question-type classification (battery by code; round files by crosswalk, else label)
  R/20_estimates.R           weighted distributions, means, SEs by country-round × subgroup (engine)
  R/30_correlations.R        weighted pairwise correlations within each country-round (engine; square and rectangular)
  R/40_indicators.R          default summaries, trend breaks and segment positions
  config/*.csv               countries (ISO3, ISO2, numeric, subregion), default indicators (instructions §5), trend breaks
  output/                    review tables: round_code_review.csv, round_catalogue_review.csv, label_rules_vs_crosswalk.csv,
                             nonresponse_only_country_rounds.csv, region_reference.csv, file_sizes.csv
  verify_site_data.py        independent Python re-computation of a random sample of published numbers (merge and round files)
  check_regions.mjs          the site's own JavaScript regional lines vs ab_region(), and the trend-break rule
public/data/                 generated; do not edit by hand
  manifest.json              rounds, countries (N and fieldwork year per round), subgroups, country sets
  index.json                 the harmonised battery (98 questions)
  rounds/<r>.json            every question in round r's own file
  v/<id>.json                all respondents (battery: every round; round-file question R7_Q28: its round)
  g/<r>/<id>.json            subgroups, one round (loaded on demand)
  r/<r>/<id>.json            within-country correlations with the battery items of round r
src/                         React front end (Vite)
  lib/stats.js               the only statistics done in the browser (re-basing, sums, regional means and their median year, p-values)
  lib/trend.js               where a trend line may be drawn and where it breaks (same rule as the R pipeline)
  lib/exporter.js            SVG / 300-dpi PNG / tidy-CSV export
scripts/build-geo.mjs        builds the two map files from Natural Earth (world-atlas): npm run geo
```

## Rules

The pipeline and the views follow `Afrobarometer Data/Data Cleaning/AB_Trend_Analysis_Instructions.md` and source `AB_functions.R` from that folder:

- **Data:** the audited merge `AB_HarmonizedMerge_v1.sav` (final, md5 `4808543fd3dc58f8e2e8cd52c3ca915e`; the build refuses any other file) for every battery number. The round files are used only for the single-round browser.
- **Weights:** always weighted with the EA-level weight `weight`.
- **Denominators:** valid (the default) and asked (AB's published style). −1, −2 and −5 are don't know / refused / missing; −3 and −4 are not asked.
- **Regional series:** country-round estimates first, then equal-weight means over fixed sets (`AB_SET_R3`, the default, and the others), shown only when every member has data.
- **Hybrid time axis:** countries at their own fieldwork year; regional points at the median year of the set's countries, labelled "R7 (2016/18)".
- **Comparability breaks:** never bridged. The line is drawn in segments, and trust trends start in R3.
- **Means:** only for interval-like scales and numeric items. R10 statement items never get a mean.
- **Exports:** every chart comes with a tidy CSV.

## Rebuilding the data

Needs:

- R 4.3 with haven, readxl, dplyr, tidyr, purrr, data.table, jsonlite and rmarkdown (reference: R 4.3.3, haven 2.5.4, data.table 1.14.10, jsonlite 1.8.8)
- about 4 GB of RAM
- the `Afrobarometer Data` folder downloaded locally:
  - `AB_HarmonizedMerge_v1.sav`
  - `Wave 1.sav` … `Wave 10.sav`
  - `Data Cleaning/`

```r
setwd("pipeline")
Sys.setenv(AB_DATA_DIR = "~/Desktop/Larry RA/Afrobarometer Data")
rmarkdown::render("build_site_data.Rmd")   # a finished knit means every check passed
```

The build writes to a staging folder and only replaces `public/data/` after all checks pass. Then:

```bash
AB_DATA_DIR=".../Afrobarometer Data" python3 -I pipeline/verify_site_data.py 600
node pipeline/check_regions.mjs
```

Two environment variables help with testing:

- `AB_BUILD_ROUNDS="9,10"` builds a subset of rounds, for testing or measuring payload size.
- `AB_SKIP_ROUND_FILES=1` builds the battery only.

## Running the site locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

## Deploying

A Vercel project builds from this repository (Vite preset). Pushing a branch creates a preview deployment behind Vercel Authentication.

## Data and citation

Afrobarometer Data, 45 countries, Rounds 1–10, 1999–2025, available at <http://www.afrobarometer.org>. Afrobarometer data are copyrighted; send Afrobarometer copies of publications that use them. This site publishes only aggregate estimates, never respondent-level data.
