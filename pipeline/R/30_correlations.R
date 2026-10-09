# =============================================================================
# 30_correlations.R: weighted pairwise Pearson correlations within each country
#
# For every pair of eligible variables (ordinal, binary, continuous) and every
# country: weighted Pearson r over respondents valid on BOTH items (pairwise
# deletion), and the unweighted pairwise N. Computed with matrix algebra:
#   SW  = Mᵀ diag(w) M          (sum of weights over pairwise-valid rows)
#   SX  = (X∘w)ᵀ M              (SX[j,k] = Σ w x_j over rows valid on j and k)
#   SXX = (X²∘w)ᵀ M
#   SXY = (X∘w)ᵀ X              (X has 0 where missing)
#   cov = SXY/SW − (SX/SW)(SXᵀ/SW); var_j = SXX/SW − (SX/SW)²
# weighted_cross_cor() is the rectangular version (every column of X against every
# column of Y), used for round-file questions × the harmonised battery.
# p-values are computed in the browser from r and N (two-sided t-test, df = N − 2).
# =============================================================================

MIN_PAIR_N <- 30

weighted_pairwise_cor <- function(X, w) weighted_cross_cor(X, X, w)

# Columns are centred and scaled first (r is unchanged by that): the one-pass sums below lose
# precision through cancellation when an item's values are large relative to their spread
# (numeric round-file items such as counts or amounts).
standardise_cols <- function(Z) {
  m <- colMeans(Z, na.rm = TRUE); m[!is.finite(m)] <- 0
  s <- sqrt(colMeans(sweep(Z, 2, m)^2, na.rm = TRUE)); s[!is.finite(s) | s == 0] <- 1
  sweep(sweep(Z, 2, m), 2, s, "/")
}

weighted_cross_cor <- function(X, Y, w) {
  X <- standardise_cols(X); Y <- standardise_cols(Y)
  Mx <- !is.na(X) * 1; My <- !is.na(Y) * 1
  X0 <- X; X0[is.na(X0)] <- 0
  Y0 <- Y; Y0[is.na(Y0)] <- 0
  SW  <- crossprod(Mx * w, My)
  SX  <- crossprod(X0 * w, My)          # Σ w x over rows valid on both
  SY  <- crossprod(Mx * w, Y0)          # Σ w y over rows valid on both
  SXX <- crossprod(X0^2 * w, My)
  SYY <- crossprod(Mx * w, Y0^2)
  SXY <- crossprod(X0 * w, Y0)
  N   <- crossprod(Mx, My)
  mx <- SX / SW; my <- SY / SW
  cv <- SXY / SW - mx * my
  vx <- SXX / SW - mx^2; vy <- SYY / SW - my^2
  r <- cv / sqrt(vx * vy)
  r[N < MIN_PAIR_N | !is.finite(r) | is.na(vx) | is.na(vy) | vx <= 1e-12 | vy <= 1e-12] <- NA
  r[!is.na(r) & r > 1] <- 1; r[!is.na(r) & r < -1] <- -1
  list(r = r, n = N)
}

# Reference implementation used by the build checks (stats::cov.wt on complete pairs)
cor_reference <- function(x, y, w) {
  ok <- !is.na(x) & !is.na(y)
  cov.wt(cbind(x[ok], y[ok]), wt = w[ok] / sum(w[ok]), cor = TRUE, method = "ML")$cor[1, 2]
}
