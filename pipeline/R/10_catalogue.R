# =============================================================================
# 10_catalogue.R: classify response codes and variables (Afrobarometer rules)
#
# Two decisions drive every number on the site, so they are made here, once,
# and written to output/ for review:
#
#   1. Each response code is "substantive", "offscale" (a valid answer that is
#      not on the scale), "nonresponse" or "not_asked".
#
#      HARMONISED BATTERY (AB_HarmonizedMerge_v1): by code, exactly as
#      ab_cy_share() does (instructions rule 3):
#         -1 don't know, -2 refused, -5 missing  -> nonresponse
#         -3 not applicable, -4 not asked        -> not_asked (out of both bases)
#         the catalog's offscale_codes (91 agree with neither, 92 not a democracy,
#         93 R1 unspecified democracy, 94 R10 demonstration "No") -> offscale
#         every other code                       -> substantive
#
#      ROUND FILES (scope B: every question in Wave 1.sav … Wave 10.sav). AB's
#      missing codes are positive and vary by item (7/8/9, 98/99, 998/999, -1), so:
#        a. a variable the crosswalk maps into the battery takes its BASE classes
#           from the reviewed Recode Rules row (missing map -1/-2/-5 -> nonresponse,
#           -3/-4 -> not_asked, everything mapped by the recode -> a valid answer), so
#           its asked and valid N equal the battery item's. Whether a valid answer is on
#           the question's own scale or off it comes from its label (R10 "No" is off the
#           battery's 0-4 scale but a normal answer to R10's own yes/no question);
#        b. every other variable is classified BY LABEL (rules below, written for
#           the labels in AB_round_inventory_missing_labels.csv);
#        c. system-missing is "not asked" (skip patterns; countries where the item
#           was not fielded). For crosswalk-matched items the merge codes it -5, but
#           it only ever covers whole countries there, which are not published.
#      Every class is listed in output/round_code_review.csv.
#
#   2. Each variable is "ordinal", "binary", "continuous", "nominal", "admin"
#      or "text". Correlations use ordinal, binary and continuous items; means
#      are offered only for interval-like scales (7+ points) and numeric items
#      (instructions rule 7: AB scales are 3–5 points, so top-two shares).
# =============================================================================

norm_label <- function(s) {
  s <- tolower(trimws(as.character(s)))
  s <- gsub("[‘’`´]", "'", s, perl = TRUE)
  gsub("\\s+", " ", s, perl = TRUE)
}

NR_CODES <- c(-1, -2, -5)          # ab_cy_share(base = "asked") keeps exactly these in the base
NA_CODES <- c(-3, -4)              # ... and drops these
NR_LABEL <- "Don't know / refused"

# ---- Harmonised battery: by code ------------------------------------------------
harm_code_table <- function(labs, xv, offscale = numeric()) {
  obs <- sort(unique(xv[!is.na(xv)]))
  lt <- if (is.null(labs) || is.character(labs)) tibble(code = numeric(), label = character()) else
    tibble(code = as.numeric(labs), label = names(labs)) |> distinct(code, .keep_all = TRUE)
  extra <- setdiff(obs, lt$code)
  if (length(extra)) lt <- bind_rows(lt, tibble(code = extra, label = NA_character_))
  lt <- lt |> arrange(code)
  lt$class <- ifelse(lt$code %in% NR_CODES, "nonresponse", ifelse(lt$code < 0, "not_asked",
              ifelse(lt$code %in% offscale, "offscale", "substantive")))
  lt$observed <- lt$code %in% obs
  lt
}

# ---- Round files: by crosswalk, else by label ----------------------------------------
ROUND_NOT_ASKED_RX <- c(
  "^not applicable", "^n/?a$", "^n/a\\b", "^na/", "^not asked", "^no contact", "^no experience",
  "^(i was )?too young to vote$")       # as the merge from R5 (voted: 'too young' is -3)
ROUND_NR_RX <- c(
  "^(dont|don't|do not|does not) know$", "^(dont|don't|do not|does not) know ?[/,(]", "^(dont|don't) know or haven't heard",
  "^refused?$", "^refused? to (answer|anser)$", "^refused? ?/", "^will not say",
  "^missing", "^(can't|cannot|could not) determine$",
  "^(do not|don't|did not|didn't) understand", "^haven't heard enough",
  "^(can't|cannot) remember$", "^i can't remember whether", "^no (answer|response)$")
ROUND_OFFSCALE_RX <- c(
  # "None" / "None of them" / "Nothing" are left alone: they are often the bottom of a scale
  # (corruption "None", R2 q47 "None of them" problems solvable)
  # "not a democracy" is off the scale only in satisfaction items (see round_code_table); in
  # extent-of-democracy items it is the bottom of the scale
  "agree with neither", "^do not agree with either", "^(it )?depends", "^neither$", "^neither side$",
  "^neither of them$", "^others?\\b", "^some other", "^none of (these|the above)\\b", "^not sure")

round_label_class <- function(labels, question = "") {
  l <- norm_label(labels)
  hit <- function(rx) Reduce(`|`, lapply(rx, grepl, x = l, perl = TRUE), FALSE)
  off <- hit(ROUND_OFFSCALE_RX) | (grepl("not a democracy$", l) & grepl("satisf", norm_label(question)))
  ifelse(is.na(labels), NA_character_,
  ifelse(hit(ROUND_NOT_ASKED_RX), "not_asked", ifelse(hit(ROUND_NR_RX), "nonresponse",
         ifelse(off, "offscale", "substantive"))))
}

# Classes from a Recode Rules row: list(missing = map, recode = map, copy = range, off = battery offscale codes)
xw_class <- function(code, xr) {
  key <- format(code, trim = TRUE)
  out <- rep(NA_character_, length(code))
  im <- key %in% names(xr$missing)
  out[im] <- ifelse(unname(xr$missing[key[im]]) %in% NA_CODES, "not_asked", "nonresponse")
  ir <- !im & key %in% names(xr$recode)
  out[ir] <- ifelse(unname(xr$recode[key[ir]]) %in% xr$off, "offscale", "substantive")
  if (!is.null(xr$copy)) {
    ic <- is.na(out) & code >= xr$copy[1] & code <= xr$copy[2] & code == round(code)
    out[ic] <- "substantive"
  }
  out
}

# Code table for one round-file variable: every observed or labelled code, its label,
# class and the rule that set it. `xr` = crosswalk classes (or NULL).
round_code_table <- function(labs, xv, xr = NULL, question = "") {
  obs <- sort(unique(xv[!is.na(xv)]))
  lt <- if (is.null(labs) || is.character(labs)) tibble(code = numeric(), label = character()) else
    tibble(code = as.numeric(labs), label = ab_norm(names(labs))) |> distinct(code, .keep_all = TRUE)
  extra <- setdiff(obs, lt$code)
  if (length(extra)) lt <- bind_rows(lt, tibble(code = extra, label = NA_character_))
  lt <- lt |> arrange(code)
  lt$observed <- lt$code %in% obs
  lab_class <- round_label_class(lt$label, question)
  if (!is.null(xr)) {
    xw <- xw_class(lt$code, xr)
    # base from the crosswalk; on / off the question's own scale from the label
    lt$class <- ifelse(xw %in% c("substantive", "offscale"), ifelse(!is.na(lab_class) & lab_class == "offscale", "offscale", "substantive"), xw)
    lt$rule <- "crosswalk"
    # a labelled code that never occurs and has no rule (an unused label) is dropped
    lt <- lt[!(is.na(lt$class) & !lt$observed), ]
    stopifnot(!anyNA(lt$class))           # every observed code has a crosswalk rule (as the merge asserts)
    return(lt)
  }
  lt$class <- lab_class; lt$rule <- ifelse(is.na(lt$label), "unlabelled", "label")
  # unlabelled codes: negative -> nonresponse (AB's -1 "Missing"); positive -> substantive,
  # except a non-integer value on a labelled scale (data-entry error) -> not asked,
  # and an unlabelled 96-99 next to a fully labelled 0-10 / 1-10 rating scale -> nonresponse
  un <- is.na(lt$label)
  lt$class[un & lt$code < 0] <- "nonresponse"
  lt$class[un & lt$code >= 0] <- "substantive"
  n_text <- sum(lt$class == "substantive" & !un)
  lab_sub <- sort(lt$code[lt$class == "substantive" & !un])
  rating <- length(lab_sub) >= 7 && max(lab_sub) <= 10 && all(diff(lab_sub) == 1)
  if (rating) lt$class[un & lt$code %in% 96:99] <- "nonresponse"
  lt$class[un & lt$code >= 0 & lt$code != round(lt$code) & n_text >= 2] <- "not_asked"
  lt
}

round_is_admin <- function(name, label) {
  grepl(ROUND_ADMIN_NAME_RX, name, ignore.case = TRUE, perl = TRUE) |
    grepl(ROUND_ADMIN_LABEL_RX, norm_label(label), perl = TRUE)
}

# "Q46a. Level of democracy: today" -> "Level of democracy: today";
# R1 "suppdemo/Support for democracy" -> "Support for democracy"
round_question_text <- function(label, name) {
  l <- trimws(ifelse(is.na(label) | !nzchar(trimws(label)), name, label))
  l <- sub("^[A-Za-z]{0,3}[0-9]+[A-Za-z0-9_]*(\\.[A-Za-z]{1,4})?[.:]\\s*", "", l, perl = TRUE)
  l <- sub("^[a-z0-9]{3,12}/(?=\\S)", "", l, perl = TRUE)
  l <- sub("^ADULTCT:\\s*", "", l)
  trimws(l)
}

# ---- Question types (LB engine rules, AB label patterns) ---------------------------
# Words that make a set of value labels look like an ordered scale.
SCALE_WORDS_RX <- paste0(
  "agree|disagree|trust|confiden|satisf|good|bad|better|worse|same|often|never|always|sometimes|",
  "rarely|frequent|occasional|likely|probabl|important|interest|close|proud|willing|influence|",
  "free|fair|easy|difficult|safe|unsafe|strong|weak|much|little|a lot|very|somewhat|rather|fairly|",
  "not at all|none|hardly|everyone|most|some|few|capable|responsive|corrupt|democra|",
  "worried|concern|serious|manage|approve|positive|negative|\\byes\\b|\\bno\\b|more|less|",
  "increase|decrease|once|twice|times|every|daily|day|week|month|year|high|low|status|",
  "poor|rich|lowest|highest|completely|fully|partly|support|oppose|favo|prefer|matter|",
  "justif|possible|sure|definitely|enough|sufficient|insufficient|protected|guaranteed|",
  "informed|beneficial|practi|improv|stayed|remained|increased|decreased|have done|could do|would (never )?do|",
  "well|badly|member|leader|inactive|active|all of them|several|many|just|only|",
  "illiterate|primary|secondary|high|university|educat|complete|incomplete|schooling|",
  "^(none|one|two|three|four|five|six|seven)$|^\\d+ days?$|",
  "^\\d+$|^\\d+\\.\\s|^\\d+ ?[-–] ?\\w+|\\w+ ?[-–] ?\\d+$")

# Question labels that mark an unordered list of answers.
NOMINAL_LABEL_RX <- paste0(
  "most important problem|\\b(1st|2nd|3rd|first|second|third) (response|mention|meaning|most)|meaning of (democracy|\"?poor)|",
  "which (political )?party|party (would you vote|voted|closest|close to)|vote for which|would vote for|voted for|",
  "which (country|one|of the following|group|language|institution|leader|organization|source)|",
  "^religi|religion|denomination|ethnic|tribe|cultural group|mother tongue|\\blanguage\\b|race of respondent|",
  "occupation|kind of work|type of work|employer|main source of|who (assists|is responsible|should|has|holds|makes)|primarily responsible|primary responsibility|",
  "priorit(y|ies)\\b|",
  "reason|why (do|did|would|not)|where do you|most effective|best describes|preferred|in what way|what (type|kind)|",
  "marital|relationship to|position in the household|province|county|name of")

NEUTRAL_LABEL_RX <- "^[\\s.…\\d]*(st|nd|rd|th)?$"   # "...", "2", "3": middle points of 0-10 scales

var_type_one <- function(name, label, xv, ct) {
  scale <- ct[ct$class == "substantive", ]
  obs <- sort(unique(xv[!is.na(xv) & xv %in% scale$code]))
  if (!length(obs)) return(list(type = "empty", reason = "no substantive values"))
  numeric_label <- !is.na(scale$label) &
    (scale$label == format(scale$code, trim = TRUE) |
     startsWith(trimws(scale$label), paste0(format(scale$code, trim = TRUE), " ")) |
     grepl("^\\d+(\\.\\d+)?$", trimws(scale$label)))
  labelled <- scale[!is.na(scale$label) & !numeric_label, ]
  if (nrow(labelled) <= 2 && (length(obs) > 12 || (nrow(labelled) == 0 && length(obs) >= 5)))
    return(list(type = "continuous", reason = sprintf("%d distinct values, %d text labels", length(obs), nrow(labelled))))
  codes <- sort(unique(scale$code[scale$code %in% obs]))
  if (length(codes) == 2) return(list(type = "binary", reason = "two scale codes"))
  if (length(codes) == 1) return(list(type = "nominal", reason = "one scale code"))
  nominal_label <- grepl(NOMINAL_LABEL_RX, norm_label(label), perl = TRUE)
  # an off-scale answer inside the range does not break the scale
  off_in <- ct$code[ct$class == "offscale" & ct$observed & ct$code > min(codes) & ct$code < max(codes)]
  consecutive <- all(diff(sort(c(codes, off_in))) == 1)
  labs <- norm_label(scale$label[!is.na(scale$label) & scale$code %in% codes])
  labs <- labs[!grepl(NEUTRAL_LABEL_RX, labs, perl = TRUE)]
  scale_share <- if (length(labs)) mean(grepl(SCALE_WORDS_RX, labs, perl = TRUE)) else 1
  if (length(codes) >= 3 && length(codes) <= 12 && consecutive && !nominal_label && scale_share >= 0.5)
    return(list(type = "ordinal", reason = sprintf("%d consecutive codes, %.0f%% scale-like labels", length(codes), 100 * scale_share)))
  # 0-10 scales labelled only at the ends
  mid <- scale$label[scale$code %in% codes[-c(1, length(codes))]]
  if (length(codes) >= 7 && length(codes) <= 12 && consecutive && !nominal_label &&
      all(is.na(mid) | grepl(NEUTRAL_LABEL_RX, norm_label(mid), perl = TRUE)))
    return(list(type = "ordinal", reason = sprintf("%d consecutive codes, labelled ends only", length(codes))))
  list(type = "nominal", reason = sprintf("%d codes, consecutive=%s, scale-like=%.0f%%, nominal label=%s",
                                          length(codes), consecutive, 100 * scale_share, nominal_label))
}

# ---- Sections for round-file questions -------------------------------------------
# Battery items keep the catalog's domain; other questions are sorted by keyword
# (a convenience for the question picker, which also searches the text).
ROUND_SECTION_RULES <- list(
  "Enumeration area"         = "in the (psu|ea)\\b|\\bpsu/ea\\b|enumeration area|^ea[_ ]",
  "Interviewer observations" = "^(interviewer|respondent'?s? (attitude|was|seemed))|others? present|check with others|influence(d)? the respondent|anyone (else )?present|interview was|during the interview|^int(erviewer)?:",
  "Health & COVID-19"        = "covid|vaccin|lockdown|pandemic|ebola|aids|hiv|died of",
  "Most important problems"  = "most important problem",
  "Environment & climate"    = "climate|pollution|environment|drought|flood|natural resource|plastic|forest|weather",
  "Trust"                    = "\\btrust\\b",
  "Corruption"               = "corrupt|bribe|\\bgift\\b|favou?r",
  "Democracy"                = "democra",
  "Statements (A vs. B)"     = "\\bvs\\.? |statement",
  "Freedoms"                 = "\\bfree(dom)?\\b|careful what|freely|censor",
  "Elections & parties"      = "elect|\\bvot(e|ed|ing|er)|ballot|campaign|part(y|ies)|candidate|register",
  "Performance"              = "handling|performance|approv|job (performance|done)|government('s)? (response|doing)",
  "Governance & accountability" = "listen|ignor|unpunish|accountab|access to information|information for official|likelihood of response|respected by|budgets? public|bids and contracts|salaries of|monitor",
  "Lived poverty"            = "gone without|went without|without enough",
  "Economy"                  = "econom|living condition|income|\\bjobs?\\b|employ|price|\\bcash\\b|poverty|\\bpoor\\b|tax|loan|savings|land",
  "Media"                    = "news|radio|television|\\btv\\b|newspaper|internet|social media|mobile phone|cell ?phone|computer|facebook|whatsapp",
  "Security & crime"         = "crime|police|\\bsafe|security|violence|theft|stolen|attack|terror|conflict|armed|military|army|unsafe",
  "Public services"          = "school|clinic|hospital|\\bwater\\b|electric|sanitation|latrine|services?\\b|\\broad|identity document|\\bhealth|medical",
  "Participation"            = "contact|attend|meeting|\\bjoin|member|raise an issue|demonstrat|protest|discuss|interest|community",
  "Identity & society"       = "ethnic|tribe|language|religio|identity|national|toleran|neighbo|women|girls|gender|equal|discriminat|tradition|chief|elders|wife|husband|justified",
  "International"            = "china|chinese|united states|\\busa\\b|america|colonial|african union|\\bau\\b|ecowas|sadc|eac\\b|foreign|international|abroad|emigrat|migrat|other countr|united nations|\\bun\\b|europe|influence of|japan|russia|india|assistance from|donor|refugee|job seekers",
  "Demographics"             = "^age$|\\bage\\b|gender|sex of|education|occupation|marital|household|children|own(s)? (a |any )|roof|toilet|shelter|adults"
)
round_section <- function(name, label, harm_domain = NA_character_) {
  if (!is.na(harm_domain)) return(harm_domain)
  l <- norm_label(label)
  if (grepl("^ea_", name, ignore.case = TRUE)) return("Enumeration area")
  for (s in names(ROUND_SECTION_RULES)) if (grepl(ROUND_SECTION_RULES[[s]], l, perl = TRUE)) return(s)
  "Other questions"
}
ROUND_SECTION_ORDER <- c("Democracy", "Democratic values", "Statements (A vs. B)", "Freedoms", "Elections & parties",
                         "Trust", "Corruption", "Performance", "Governance & accountability", "Most important problems",
                         "Economy", "Lived poverty", "Participation", "Media", "Environment & climate",
                         "Public services", "Security & crime", "Identity & society", "International", "Health & COVID-19",
                         "Demographics", "Derived", "Enumeration area", "Interviewer observations", "Other questions")
