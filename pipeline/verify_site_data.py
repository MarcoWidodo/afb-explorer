"""
Independent check of the site data (public/data) against AB_HarmonizedMerge_v1.sav
and the ten round files (Wave 1.sav … Wave 10.sav).

A second implementation, in Python (pyreadstat + numpy), recomputes a random
sample of published numbers from scratch:
  - country-round cells: valid-base % per code, nonresponse % (asked base),
    asked-base % of the default answers, N, mean, for all respondents AND for
    subgroups (gender, age, education, urban/rural), for battery items (from the
    merge) and for round-file questions (from the round files)
  - trend points: the default indicator of every featured battery item, every country-round
  - within-country weighted correlations: battery x battery and round-file x battery
  - the benchmarks: equal-weight means (asked base) vs AB_merge_audit_benchmarks.csv
It trusts only the code lists written in each file (which codes are valid answers,
which are nonresponse); every sum, weight, subgroup and row alignment is rebuilt here
from the raw columns.

Usage:  AB_DATA_DIR=".../Afrobarometer Data" python3 -I pipeline/verify_site_data.py [n_samples]
Exit code 1 if any difference exceeds rounding.
"""
import csv, json, os, random, sys
import numpy as np
import pyreadstat

DATA = os.environ.get("AB_DATA_DIR", os.path.expanduser("~/Desktop/Larry RA/Afrobarometer Data"))
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "public", "data")
N = int(sys.argv[1]) if len(sys.argv) > 1 else 500
random.seed(2026)

man = json.load(open(os.path.join(SITE, "manifest.json"), encoding="utf-8"))
idx = json.load(open(os.path.join(SITE, "index.json"), encoding="utf-8"))
UNITS = [w["id"] for w in man["waves"]]
ROUND_FILES = man.get("round_files", False)

# ---- the merge -------------------------------------------------------------------
MERGE = os.path.join(DATA, "AB_HarmonizedMerge_v1.sav")
cols = ["round", "iso3", "respno", "weight", "gender", "age", "education4", "urban_rural"] + [v["id"] for v in idx["vars"]]
mg, _ = pyreadstat.read_sav(MERGE, usecols=list(dict.fromkeys(cols)), user_missing=True)
assert len(mg) == 402776
rnd = mg["round"].values.astype(int)
ctry = mg["iso3"].values.astype(str)
wt = mg["weight"].values.astype(float)
g_, a_, e_, u_ = (mg[c].values.astype(float) for c in ("gender", "age", "education4", "urban_rural"))
GROUPS = {
    "all": np.ones(len(mg), bool),
    "men": g_ == 1, "women": g_ == 2,
    "age18": (a_ >= 0) & (a_ <= 29), "age30": (a_ >= 30) & (a_ <= 44), "age45": (a_ >= 45) & (a_ <= 59), "age60": (a_ >= 60) & (a_ <= 120),
    "edu_none": e_ == 0, "edu_prim": e_ == 1, "edu_sec": e_ == 2, "edu_post": e_ == 3,
    "urban": u_ == 1, "rural": u_ == 2,
}
COL = {v["id"]: mg[v["id"]].values.astype(float) for v in idx["vars"]}

# ---- round files: the columns of the sampled questions, aligned to the merge's rows --
rounds_idx = {}
if ROUND_FILES:
    for u in UNITS:
        rounds_idx[u] = json.load(open(os.path.join(SITE, "rounds", f"{u}.json"), encoding="utf-8"))
ID_VAR = {1: "refnumb"}
ROUND_COL = {}
def round_columns(u, names):
    """Read the given columns of Wave u.sav and check row alignment with the merge (respondent number)."""
    need = [n for n in names if (u, n) not in ROUND_COL]
    if not need:
        return
    idv = ID_VAR.get(u, "RESPNO" if u >= 4 else "respno")
    df, _ = pyreadstat.read_sav(os.path.join(DATA, f"Wave {u}.sav"), usecols=need + [idv], user_missing=True)
    rows = np.where(rnd == u)[0]
    assert len(df) == len(rows), (u, len(df), len(rows))
    ids = df[idv].values
    ids = np.array([f"{int(x):05d}" for x in ids]) if u == 1 else np.array([str(x).strip() for x in ids])
    assert (ids == mg["respno"].values[rows].astype(str)).all(), f"R{u}: rows do not line up with the merge"
    for n in need:
        full = np.full(len(mg), np.nan)
        full[rows] = df[n].values.astype(float)
        ROUND_COL[(u, n)] = full

recs = {}
def rec(i):
    if i not in recs:
        recs[i] = json.load(open(os.path.join(SITE, "v", i + ".json"), encoding="utf-8"))
    return recs[i]
def column(r):
    return ROUND_COL[(r["round"], r["code"])] if "code" in r else COL[r["id"]]

fails = []
st = {"cells": 0, "group_cells": 0, "round_file_cells": 0, "max_p": 0.0, "max_q": 0.0, "max_asked": 0.0, "max_m": 0.0,
      "trend_points": 0, "max_trend_share": 0.0, "max_trend_mean": 0.0, "corr": 0, "corr_round_file": 0, "max_r": 0.0,
      "benchmarks": 0, "max_benchmark": 0.0}

def masks(r, x, u, cc, grp):
    base = (rnd == u) & (ctry == cc) & GROUPS[grp]
    if r["type"] == "continuous":
        valid = base & ~np.isnan(x) & (x >= r["range"][0]) & (x <= r["range"][1]) & ~np.isin(x, r["nr_raw"])
    else:
        valid = base & np.isin(x, r["codes"])
    nr = base & np.isin(x, r["nr_raw"])
    return valid, nr

def check_cell(i, entry_d):
    r = rec(i)
    u = random.choice(list(r["est"].keys()))
    cc = random.choice(list(r["est"][u].keys()))
    grp, cell = "all", r["est"][u][cc]
    if random.random() < 0.5:
        gpath = os.path.join(SITE, "g", u, i + ".json")
        if os.path.exists(gpath):
            gest = json.load(open(gpath, encoding="utf-8"))["est"].get(cc, {})
            if gest:
                grp = random.choice(list(gest.keys())); cell = gest[grp]
    x = column(r)
    valid, nr = masks(r, x, int(u), cc, grp)
    asked = valid | nr
    if cell["n"] != asked.sum() or cell["nv"] != valid.sum():
        fails.append(("N", i, u, cc, grp, cell["n"], int(asked.sum()), cell["nv"], int(valid.sum()))); return
    st["cells" if grp == "all" else "group_cells"] += 1
    if "code" in r:
        st["round_file_cells"] += 1
    if r["type"] != "continuous":
        codes = cell.get("k", r["codes"])
        for code, p in zip(codes, cell["p"]):
            mine = 100 * wt[valid & (x == code)].sum() / wt[valid].sum()
            st["max_p"] = max(st["max_p"], abs(mine - p))
        if entry_d and entry_d["type"] == "share":
            pub = sum(p for code, p in zip(codes, cell["p"]) if code in entry_d["codes"]) * (1 - sum(cell.get("q", [0])) / 100)
            mine = 100 * wt[valid & np.isin(x, entry_d["codes"])].sum() / wt[asked].sum()
            st["max_asked"] = max(st["max_asked"], abs(mine - pub) / max(1, len(entry_d["codes"])))
    if "m" in cell:
        on = valid & ~np.isin(x, r.get("offscale", []))
        st["max_m"] = max(st["max_m"], abs(np.average(x[on], weights=wt[on]) - cell["m"]))
    for q in cell.get("q", []):
        mine = 100 * wt[nr].sum() / wt[asked].sum()
        st["max_q"] = max(st["max_q"], abs(mine - q))

# ---- country-round cells: battery (from the merge) -----------------------------
vars_by_id = {v["id"]: v for v in idx["vars"]}
for _ in range(N):
    v = random.choice(idx["vars"])
    check_cell(v["id"], v["d"])

# ---- country-round cells: round-file questions (from the round files) ----------
if ROUND_FILES:
    sample = [(u, random.choice(rounds_idx[u]["vars"])) for u in random.choices(UNITS, k=N // 2)]
    for u in UNITS:
        round_columns(u, sorted({e["code"] for uu, e in sample if uu == u}))
    for u, e in sample:
        check_cell(e["id"], e["d"])

# ---- trend points: featured battery items, every country-round -----------------
for v in [x for x in idx["vars"] if x.get("f")]:
    r = rec(v["id"]); d = v["d"]; xv = COL[v["id"]]
    for u, uu in r["est"].items():
        for cc, cell in uu.items():
            m = (rnd == int(u)) & (ctry == cc)
            valid = m & np.isin(xv, r["codes"]) if r["type"] != "continuous" else m & (xv >= 0)
            st["trend_points"] += 1
            if d["type"] == "mean":
                st["max_trend_mean"] = max(st["max_trend_mean"], abs(np.average(xv[valid], weights=wt[valid]) - cell["m"]))
            else:
                codes = cell.get("k", r["codes"])
                pub = sum(p for code, p in zip(codes, cell["p"]) if code in d["codes"])
                mine = 100 * wt[valid & np.isin(xv, d["codes"])].sum() / wt[valid].sum()
                st["max_trend_share"] = max(st["max_trend_share"], abs(mine - pub) / len(d["codes"]))

# ---- correlations --------------------------------------------------------------
def onscale(r):
    x = column(r)
    if r["type"] == "continuous":
        return x, ~np.isnan(x) & (x >= r["range"][0]) & (x <= r["range"][1])
    off = set(r.get("offscale", []))
    return x, np.isin(x, [c for c in r["codes"] if c not in off])
for k in range(N // 2):
    u = random.choice(UNITS)
    ci = json.load(open(os.path.join(SITE, "r", str(u), "index.json"), encoding="utf-8"))
    corr, items = ci["corr"], ci.get("items", [])
    if items and k % 2:
        a = random.choice(items); b = random.choice(corr)
        ra = rec(a); round_columns(u, [ra["code"]])
    else:
        a, b = random.sample(corr, 2); ra = rec(a)
    rr = json.load(open(os.path.join(SITE, "r", str(u), a + ".json"), encoding="utf-8"))
    cc = random.choice(list(rr["r"].keys()))
    j = corr.index(b)
    r_pub = rr["r"][cc][j]
    n_pub = rr["n0"][cc] - rr["dn"][cc][j]
    xa, va = onscale(ra); xb, vb = onscale(rec(b))
    m = (rnd == u) & (ctry == cc) & va & vb
    if m.sum() != n_pub:
        fails.append(("corr N", u, a, b, cc, n_pub, int(m.sum()))); continue
    if m.sum() < 30:
        if r_pub is not None: fails.append(("corr n<30 but r published", u, a, b, cc))
        continue
    w = wt[m]; X, Y = xa[m], xb[m]
    mx, my = np.average(X, weights=w), np.average(Y, weights=w)
    sx, sy = np.sqrt(np.average((X - mx) ** 2, weights=w)), np.sqrt(np.average((Y - my) ** 2, weights=w))
    if sx == 0 or sy == 0 or r_pub is None: continue
    st["corr"] += 1
    if "code" in ra: st["corr_round_file"] += 1
    st["max_r"] = max(st["max_r"], abs(np.average((X - mx) * (Y - my), weights=w) / (sx * sy) - r_pub / 1000))

# ---- benchmarks: the site's equal-weight means (asked base) vs the audit -------------
SUCC = {"dem_support": [1], "rej_oneman": [4, 5], "rej_oneparty": [4, 5], "rej_military": [4, 5], "dem_satis": [3, 4],
        "dem_extent": [3, 4], "demand_dem": [4], "supply_dem": [2]}
set28 = next(s for s in man["country_sets"] if s["id"] == "r6")["countries"]
if 9 in UNITS and 10 in UNITS:
    for row in csv.DictReader(open(os.path.join(DATA, "Data Cleaning", "AB_merge_audit_benchmarks.csv"), encoding="utf-8")):
        if not row["note"].endswith("weight = weight") or row["variable"] not in SUCC or not row["merged"]:
            continue
        r = rec(row["variable"]); u = str(int(float(row["round"])))
        members = set28 if int(float(row["n_countries"])) == 28 else list(r["est"][u].keys())
        assert len(members) == int(float(row["n_countries"]))
        vals = []
        for cc in members:
            cell = r["est"][u][cc]; codes = cell.get("k", r["codes"])
            vals.append(sum(p for c, p in zip(codes, cell["p"]) if c in SUCC[row["variable"]]) * (1 - sum(cell.get("q", [0])) / 100))
        st["benchmarks"] += 1
        st["max_benchmark"] = max(st["max_benchmark"], abs(np.mean(vals) - float(row["merged"])))

print(json.dumps(st, indent=1))
ok = (not fails and st["max_p"] <= 0.051 and st["max_q"] <= 0.051 and st["max_asked"] <= 0.101
      and st["max_m"] <= 0.00051 and st["max_trend_share"] <= 0.051 and st["max_trend_mean"] <= 0.00051 and st["max_r"] <= 0.00051
      and st["cells"] + st["group_cells"] >= 0.9 * (N + (N // 2 if ROUND_FILES else 0)) and st["corr"] >= N // 4
      and (not ROUND_FILES or (st["round_file_cells"] >= N // 3 and st["corr_round_file"] >= N // 10))
      and (st["benchmarks"] in (0, 13)) and st["max_benchmark"] <= 0.05)
if fails:
    print("FAILURES:", *fails[:20], sep="\n  ")
print("ALL CHECKS PASSED" if ok else "CHECKS FAILED")
sys.exit(0 if ok else 1)
