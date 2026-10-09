# =============================================================================
# 40_indicators.R: default summaries and trend breaks
#
# Harmonised battery: the default summary of every item is set in
# config/trend_indicators.csv (instructions §5: top-two shares; AB's index
# headlines). Round-file questions get a rule-based default.
# =============================================================================

# Default indicator:
#   config/trend_indicators.csv     -> as listed (every harmonised item)
#   continuous, or ordinal 7+ codes -> mean (interval-like)
#   ordinal 4+ codes                -> % in the two highest categories (AB scales mostly run
#                                      from the negative/none end: 0 never … 4 always, 1 strongly
#                                      disapprove … 4 strongly approve)
#   ordinal 3 codes                 -> % in the highest category
#   binary                          -> % code 1 when coded 0/1 ("yes"), else the first code
#   nominal                         -> the most common answer in the latest round (set in the build)
default_indicator <- function(v, type, scale_codes, ti = NULL) {
  row <- if (is.null(ti)) NULL else ti[ti$variable == v, ]
  if (!is.null(row) && nrow(row)) {
    if (row$success_codes == "mean") return(list(type = "mean"))
    return(list(type = "share", codes = arr(as.numeric(strsplit(row$success_codes, ";")[[1]]))))
  }
  sc <- sort(scale_codes); k <- length(sc)
  if (type == "continuous" || (type == "ordinal" && k >= 7)) return(list(type = "mean"))
  if (type == "ordinal") return(list(type = "share", codes = arr(if (k >= 4) sc[(k - 1):k] else sc[k])))
  if (type == "binary") return(list(type = "share", codes = arr(if (all(sc %in% c(0, 1))) 1 else sc[1])))
  NULL
}

mean_allowed <- function(type, scale_codes) type == "continuous" || (type == "ordinal" && length(scale_codes) >= 7)

# Trend breaks between adjacent rounds (config/trend_breaks.csv): the trend line is split
# into segments at each declared break ("3|4" = never join R3 to R4) and starts at `start`
# (earlier rounds are not drawn in the trend view; instructions rule 6).
trend_breaks <- function(v, tb) {
  row <- tb[tb$variable == v, ]
  if (!nrow(row)) return(NULL)
  pairs <- if (nzchar(row$breaks)) lapply(strsplit(strsplit(row$breaks, ";")[[1]], "|", fixed = TRUE), function(p) arr(as.integer(p))) else list()
  out <- list(breaks = pairs, note = row$note)
  if (nzchar(row$start)) out$start <- as.integer(row$start)
  out
}

# Positions on a trend line: +1 per round shown, +2 across a declared break, so a line
# joins two points only when their positions differ by exactly 1. (Same rule as the
# Time-Series view; used by the build checks.)
trend_positions <- function(rounds, tb) {
  start <- tb$start %||% -Inf
  rs <- sort(rounds[rounds >= start])
  # a break (a, b) separates consecutive shown rounds (x, y) whenever x <= a and b <= y
  crosses <- function(x, y) any(vapply(tb$breaks %||% list(), function(p) x <= p[1] && p[2] <= y, logical(1)))
  pos <- integer(length(rs)); k <- 0L
  for (i in seq_along(rs)) {
    if (i > 1) k <- k + if (crosses(rs[i - 1], rs[i])) 2L else 1L
    pos[i] <- k
  }
  setNames(pos, rs)
}
