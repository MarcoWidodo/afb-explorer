# =============================================================================
# 00_config.R: everything survey-specific lives here (plus pipeline/config/*.csv)
#
# Afrobarometer edition of the barometer-explorer engine (seeded from the
# Latinobarómetro Explorer v1 pipeline, lb-explorer@2a9d59f). The estimation
# code in 20–50_*.R is survey-agnostic engine code; AB-specific rules sit here
# and in 10_catalogue.R / 40_indicators.R.
# =============================================================================

SURVEY <- list(
  id          = "ab",
  name        = "Afrobarometer",
  short       = "AB",
  region      = "Africa",
  url         = "https://www.afrobarometer.org",
  attribution = paste(
    "Afrobarometer is a pan-African, non-partisan survey research network that conducts public attitude",
    "surveys on democracy, governance, the economy and society in African countries."),
  # instructions rule 11: AB's citation form
  citation    = paste(
    "Afrobarometer Data, 45 countries, Rounds 1–10, 1999–2025, available at http://www.afrobarometer.org.",
    "Harmonised for this site from AB_HarmonizedMerge_v1 (rounds 1–10) and the ten round files."),
  unit_label  = "Round",
  nr_text     = "Don't know / refused",
  contact     = "widodomarco@gmail.com",
  # shown as a banner on every page until Afrobarometer agrees to a public release
  preview_notice = paste(
    "Private preview for the research team. Afrobarometer data are copyrighted, and its data-use terms do not cover",
    "republishing aggregates on another website; do not share this site publicly without Afrobarometer's permission.")
)

# ---- Paths -------------------------------------------------------------------
# AB_DATA_DIR: the "Afrobarometer Data" folder, holding AB_HarmonizedMerge_v1.sav,
# Wave 1.sav … Wave 10.sav and "Data Cleaning/" (AB_functions.R, the variable
# catalog, the country-round table, the crosswalk). Downloaded locally, not
# iCloud placeholders. Set with Sys.setenv(AB_DATA_DIR = "...") before knitting.
DATA_DIR      <- Sys.getenv("AB_DATA_DIR", unset = "~/Desktop/Larry RA/Afrobarometer Data")
MERGE_FILE    <- file.path(DATA_DIR, "AB_HarmonizedMerge_v1.sav")
CLEANING_DIR  <- file.path(DATA_DIR, "Data Cleaning")
AB_FUNCTIONS  <- file.path(CLEANING_DIR, "AB_functions.R")
CATALOG       <- file.path(CLEANING_DIR, "AB_HarmonizedMerge_v1_variable_catalog.csv")
COUNTRY_ROUND <- file.path(CLEANING_DIR, "AB_HarmonizedMerge_v1_country_round.csv")
CROSSWALK     <- file.path(CLEANING_DIR, "AB_Variable_Harmonization_Crosswalk.xlsx")
BENCHMARKS    <- file.path(CLEANING_DIR, "AB_merge_audit_benchmarks.csv")
ROUND_FILE    <- function(r) file.path(DATA_DIR, sprintf("Wave %d.sav", r))
# The final merge (not the 2026-10-04 draft). The build refuses any other file.
MERGE_MD5     <- "4808543fd3dc58f8e2e8cd52c3ca915e"

CONFIG_DIR <- file.path(PIPELINE_DIR, "config")
OUT_DIR    <- file.path(PIPELINE_DIR, "..", "public", "data")   # site data
REVIEW_DIR <- file.path(PIPELINE_DIR, "output")                 # review tables

# Build only some rounds (for testing or measuring payload size). Empty = all.
BUILD_ROUNDS <- as.integer(strsplit(Sys.getenv("AB_BUILD_ROUNDS", ""), "[, ]+")[[1]])
# Skip the round-file browser (scope B) for a quick harmonised-only build.
SKIP_ROUND_FILES <- identical(Sys.getenv("AB_SKIP_ROUND_FILES"), "1")

# ---- Units: rounds ---------------------------------------------------------------
# One unit per Afrobarometer round (ids 1–10). Countries within a round were surveyed in
# different calendar years; every country-round carries its own fieldwork year (the
# merge's `year`, the median interview year; R1 from AB Working Paper 98), and the
# time axis is hybrid (instructions rule 5).
ROUNDS <- 1:10
WEIGHT_VAR <- "weight"        # EA-level within-country weight in every round (decision 3)

# ---- Harmonised variables that are never shown (identifiers, weights, design) --
ADMIN_VARS <- c("resp_id", "round", "country_code", "iso3", "country", "subregion", "respno",
                "year", "date_interview", "weight", "weight_hh")

# ---- Subgroups (from the merge, so identical in every round) -----------------------
SUBGROUPS <- list(
  list(id = "gender", label = "Gender", source = "gender",
       groups = list(list(id = "men",   label = "Men",   codes = 1),
                     list(id = "women", label = "Women", codes = 2))),
  list(id = "age", label = "Age", source = "age",
       groups = list(list(id = "age18", label = "Under 30", range = c(0, 29)),
                     list(id = "age30", label = "30–44",    range = c(30, 44)),
                     list(id = "age45", label = "45–59",    range = c(45, 59)),
                     list(id = "age60", label = "60+",      range = c(60, 120)))),
  list(id = "edu", label = "Education", source = "education4",
       groups = list(list(id = "edu_none", label = "No formal schooling", codes = 0),
                     list(id = "edu_prim", label = "Primary",             codes = 1),
                     list(id = "edu_sec",  label = "Secondary",           codes = 2),
                     list(id = "edu_post", label = "Post-secondary",      codes = 3))),
  list(id = "urban", label = "Urban / rural", source = "urban_rural",
       groups = list(list(id = "urban", label = "Urban", codes = 1),
                     list(id = "rural", label = "Rural", codes = 2)))
)
SUBGROUP_NOTES <- list(
  age   = "Age in years from the merge's age (Q1 in most rounds).",
  edu   = "Education in four groups from the merge's education4: no formal schooling; primary (informal, some or completed primary); secondary (some or completed); post-secondary (any).",
  urban = "Urban or rural primary sampling unit, as recorded by Afrobarometer (URBRUR)."
)

MIN_CELL_N <- 30   # cells with fewer valid respondents are written but flagged; the UI hides them

# ---- Fixed country sets for regional averages (ISO3) ---------------------------
# Regional values are the unweighted mean of country estimates (each country counts
# equally) and are shown only for rounds in which EVERY member has data, as
# ab_region() does. `ab` names the AB_functions.R set each must equal.
COUNTRY_SETS <- list(
  list(id = "r3", label = "17 countries surveyed in every round since R3", short = "17-country average",
       ab = "AB_SET_R3", span = "R3–R10 (2005–2025)", balanced = TRUE,
       note = "The merge's default set. Madagascar (not surveyed in R8) is not in it."),
  list(id = "r1", label = "12 countries surveyed in every round since R1", short = "12-country average",
       ab = "AB_SET_R1", span = "R1–R10 (1999–2025)", balanced = TRUE),
  list(id = "r2", label = "16 countries surveyed in every round since R2", short = "16-country average",
       ab = "AB_SET_R2", span = "R2–R10 (2002–2025)", balanced = TRUE),
  list(id = "r4", label = "18 countries surveyed in every round since R4", short = "18-country average",
       ab = "AB_SET_R4", span = "R4–R10 (2008–2025)", balanced = TRUE),
  list(id = "r6", label = "28 countries surveyed in every round since R6 (AB's trend set)", short = "28-country average",
       ab = "AB_SET_R6", span = "R6–R10 (2014–2025)", balanced = TRUE,
       note = "The fixed 28-country set Afrobarometer uses for its own trend figures (Policy Paper 106)."),
  list(id = "r6_west", label = "West Africa (11 of the 28)", short = "West Africa (11)",
       ab = "AB_SET_R6_WEST", span = "R6–R10 (2014–2025)", balanced = TRUE),
  list(id = "r6_southern", label = "Southern Africa (9 of the 28)", short = "Southern Africa (9)",
       ab = "AB_SET_R6_SOUTHERN", span = "R6–R10 (2014–2025)", balanced = TRUE),
  list(id = "r6_east", label = "East Africa (4 of the 28)", short = "East Africa (4)",
       ab = "AB_SET_R6_EAST", span = "R6–R10 (2014–2025)", balanced = TRUE),
  list(id = "r6_north", label = "North Africa (2 countries: Morocco, Tunisia)", short = "North Africa (2 countries)",
       ab = "AB_SET_R6_NORTH", span = "R6–R10 (2014–2025)", balanced = TRUE,
       note = "Only 2 countries: an average of two country lines, not a regional estimate."),
  list(id = "r6_central", label = "Central Africa (2 countries: Cameroon, Gabon)", short = "Central Africa (2 countries)",
       ab = "AB_SET_R6_CENTRAL", span = "R6–R10 (2014–2025)", balanced = TRUE,
       note = "Only 2 countries: an average of two country lines, not a regional estimate."),
  list(id = "all", label = "All countries surveyed in the round (unbalanced)", short = "All surveyed (unbalanced)",
       span = "R1–R10 (1999–2025)", balanced = FALSE,
       note = "Membership changes from round to round (12 countries in R1, 34–39 from R5), which can move the line by itself. The number of countries is shown for every point.")
)
DEFAULT_SET <- "r3"

# ---- Round files (scope B: every question in every round) ------------------------
# Columns that are identifiers, sampling design, interview administration, weights or
# AB's own convenience flags: never shown as questions. Matched case-insensitively
# against the whole variable name.
ROUND_ADMIN_NAME_RX <- paste0("^(", paste(c(
  "respno", "refnumb", "casenumb", "sbjnum", "intvno", "identity",
  "country", "country_.*", "country\\..*", "urbrur", "urbrur_cond", "region", "region_.*", "district",
  "location\\..*", "ea_?code", "ea_id", "psu", "strata", "backchk", "thisint", "prevint", "calls",
  "hholdse\\d+", "dateintr", "strtime", "endtime", "length", "length_int",
  "withinwt", "withinwt_.*", "acrosswt", "combinwt", "combinwt_.*", "africawt", "afcombwt",
  "filter_\\$", "r\\d+\\.only", "r\\d.*ctry", "r4\\.less\\.mad", "r8part", "r\\d+(\\.r\\d+)+\\.only",
  ".*\\.africa\\.only", ".*_cond", "age_v.*"), collapse = "|"), ")$")
# Variable labels that mark interview administration or the interviewer's own details.
ROUND_ADMIN_LABEL_RX <- paste0(
  "interviewer'?s? (number|id|age|gender|sex|home|language|education|urban|rural|name)|",
  "^(q\\d+[a-z]?\\.\\s*)?(date|time) (of|interview)|length of interview|duration of interview|",
  "reason for unsuccessful call|number of calls|household (number|selection)|^(q\\d+[a-z]?\\.\\s*)?respondent number")

# ---- Continuous variables: histogram bins -------------------------------------
N_BINS <- 10
