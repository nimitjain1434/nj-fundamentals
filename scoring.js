"use strict";

// NJ analyst assumptions, v1.0. These are scoring anchors, not regulatory limits
// or statistically calibrated predictors of investment returns.
const NJScoring = (() => {
  const version = "1.0";
  const pillars = ["Profitability", "Growth", "Balance-sheet strength", "Cash / earnings durability", "Valuation"];
  const metric = (id, label, unit, anchors, definition, critical = false) => ({id, label, unit, anchors, definition, critical});
  const M = {
    roce: metric("roce", "3-year median ROCE", "%", [0,8,14,20,28], "EBIT / average capital employed, consistently defined; median of three annual observations.", true),
    roe: metric("roe", "3-year median ROE", "%", [0,8,13,18,25], "Recurring PAT / average positive common equity; three-year median. Negative equity is a risk flag."),
    margin: metric("margin", "3-year median EBIT margin", "%", [0,5,10,18,25], "Recurring EBIT excluding other income / operating revenue; median of three annual margins."),
    sales: metric("sales", "3-year revenue CAGR", "%", [-5,0,7,13,20], "100 × ((latest annual operating revenue / revenue exactly three years earlier)^(1/3) − 1). Positive comparable endpoints; remove material acquisition effects."),
    eps: metric("eps", "3-year diluted EPS CAGR", "%", [-10,0,8,15,25], "Three-year CAGR of recurring, corporate-action-adjusted diluted EPS; both endpoints must be positive. Loss-to-profit recovery is unscored."),
    debt: metric("debt", "Net debt / EBITDA", "×", [5,3.5,2,1,0], "Interest-bearing debt including leases less unrestricted cash / positive recurring EBITDA. Net cash may be negative; negative EBITDA is not a cheap debt multiple.", true),
    cover: metric("cover", "EBIT interest coverage", "×", [1,2,4,8,15], "Recurring EBIT / positive finance cost, with consistent lease treatment. Do not use total liabilities as debt. Debt-free firms need a documented ratio policy."),
    cash: metric("cash", "3-year aggregate CFO / PAT", "%", [0,50,80,100,120], "100 × sum of three years operating cash flow / sum of comparable positive recurring PAT. Match periods, units and consolidation basis; exclude financial lenders.", true),
    fcf: metric("fcf", "Positive FCF years out of 5", "years", [0,1,2,4,5], "Count of five annual periods with CFO less total cash capex > 0; do not substitute investing cash flow. Requires all five observations."),
    pe: metric("pe", "Recurring trailing P/E", "×", [50,35,25,18,12], "Valuation-date price / corporate-action-adjusted recurring diluted TTM EPS > 0. Negative or zero earnings are unavailable, never cheap.", true),
    yield: metric("yield", "Normalized FCF yield", "%", [0,2,4,6,9], "100 × normalized recurring annual equity FCF / positive equity market cap at the valuation date; disclose normalization, capex and debt assumptions."),
    ev: metric("ev", "Normalized EV / EBITDA", "×", [22,16,11,8,5], "Current enterprise value including leases / positive normalized EBITDA; use the same lease convention in both. Document the normalization window.", true),
    roic: metric("roic", "5-year median ROCE", "%", [0,6,10,15,22], "Five annual EBIT / average capital-employed observations covering a business cycle; use the median, not peak-year returns.", true),
    cycle: metric("cycle", "5-year median EBIT margin", "%", [0,5,10,16,24], "Median recurring operating margin across five annual periods. Review whether the observed window includes both strong and weak years."),
    roa: metric("roa", "Recurring return on assets", "%", [0,0.5,1,1.5,2], "Recurring annual PAT / average total assets. For lenders, verify entity scope and remove one-off treasury gains.", true),
    loan: metric("loan", "3-year loan-book CAGR", "%", [-5,0,8,14,20], "Three-year comparable gross loan-book CAGR, with positive endpoints and merger adjustments. High growth does not offset asset-quality weakness."),
    deposit: metric("deposit", "3-year deposit CAGR", "%", [-5,0,7,12,18], "Three-year comparable deposit CAGR. Check funding mix and deposit concentration separately."),
    npa: metric("npa", "Net NPA / net advances", "%", [4,2,1,0.5,0.2], "Latest disclosed net NPA percentage; retain a reported zero. Match loan book, date and accounting basis.", true),
    cet: metric("cet", "CET1 buffer over applicable minimum", "pp", [0,1,3,5,8], "Disclosed CET1 ratio minus the entity-specific applicable minimum including buffers. Verify current jurisdictional requirements; enter percentage points.", true),
    liquidity: metric("liquidity", "Liquidity coverage ratio", "%", [100,110,125,145,180], "Latest disclosed LCR using consistent averaging; inspect short-term funding concentration independently."),
    credit: metric("credit", "3-year median credit cost", "%", [3,2,1.2,0.7,0.3], "Annual credit provisions / average gross advances; median of three years. Large recoveries or provision releases require review."),
    pbroe: metric("pbroe", "P/B per 10% sustainable ROE", "×", [4,3,2,1.3,0.8], "P/B ÷ (sustainable ROE percentage / 10); both book equity and sustainable ROE must be positive. E.g. P/B 2 and ROE 15% gives 1.33.", true),
    pb: metric("pb", "Price / tangible book", "×", [5,3.5,2.5,1.5,0.8], "Valuation-date market cap / positive tangible common equity. A low multiple with poor assets is not automatically good value."),
    capital: metric("capital", "Capital adequacy buffer", "pp", [0,2,4,7,10], "Disclosed total capital adequacy minus the entity-specific applicable regulatory minimum including buffers.", true),
    alm: metric("alm", "Liquidity / next 12-month debt maturities", "×", [0.5,0.8,1,1.3,1.8], "Unencumbered liquid assets plus committed undrawn lines / positive debt maturities in the next 12 months; exclude expected refinancing."),
    nbroa: metric("nbroa", "Recurring return on assets", "%", [0,0.8,1.8,2.8,4], "Recurring annual PAT / average assets. Compare similar secured/unsecured lending models.", true),
    vnb: metric("vnb", "Value of new business margin", "%", [0,10,18,25,32], "Disclosed VNB / annualized premium equivalent (APE), consistently defined; review assumptions and product mix.", true),
    vnbg: metric("vnbg", "3-year VNB CAGR", "%", [-10,0,8,15,25], "Comparable value-of-new-business CAGR using consistent actuarial assumptions and positive endpoints."),
    ape: metric("ape", "3-year APE CAGR", "%", [-5,0,7,13,20], "Three-year annualized-premium-equivalent CAGR with consistent product and consolidation scope."),
    solvency: metric("solvency", "Solvency buffer over applicable minimum", "pp", [0,15,35,65,110], "Disclosed solvency percentage minus the applicable required percentage; enter percentage points, not times.", true),
    persist: metric("persist", "13th-month premium persistency", "%", [55,65,75,85,92], "Premium-based 13th-month persistency from comparable company disclosures; do not mix policy-count persistency."),
    persist61: metric("persist61", "61st-month premium persistency", "%", [30,40,50,60,75], "Premium-based 61st-month persistency; retain consistent product cohort definition."),
    evgrowth: metric("evgrowth", "Operating return on embedded value", "%", [0,6,10,15,20], "Disclosed operating embedded-value earnings / opening EV; exclude market assumption and methodology changes."),
    pev: metric("pev", "Price / embedded value", "×", [5,4,3,2,1], "Valuation-date market cap / positive latest disclosed embedded value; align valuation assumptions and reporting date.", true),
    vnbmultiple: metric("vnbmultiple", "(Market cap − EV) / VNB", "×", [45,30,20,12,5], "Current market cap less embedded value, divided by positive annual VNB. EV here means embedded value, not enterprise value. Negative residuals require review."),
    working: metric("working", "Net working-capital days", "days", [180,120,75,40,0], "(Trade receivables + inventory − trade payables) / annual operating revenue × 365. Exclude financing debt and customer advances unless documented."),
    dilution: metric("dilution", "3-year diluted share-count CAGR", "%", [12,7,3,1,0], "Three-year CAGR of weighted diluted shares adjusted for splits/bonuses; acquisitions and employee dilution still count."),
    occupancy: metric("occupancy", "Hospital bed occupancy", "%", [35,45,55,65,75], "Comparable occupied bed days / available operational bed days; separate mature and newly opened facilities."),
    arpu: metric("arpu", "3-year ARPU CAGR", "%", [-5,0,4,8,12], "Comparable average revenue per user CAGR; maintain subscriber definitions."),
    load: metric("load", "Passenger load factor", "%", [55,65,75,85,92], "Revenue passenger kilometres / available seat kilometres; interpret with fares, route mix and capacity growth."),
    spread: metric("spread", "RASK minus CASK", "%", [-15,-5,0,5,12], "100 × (revenue per available seat km − cost per available seat km) / CASK; same period, lease and fuel basis."),
    nav: metric("nav", "Discount to conservative SOTP NAV", "%", [-20,0,15,30,45], "100 × (conservative equity SOTP NAV − market cap) / positive equity NAV after holding-company debt, taxes and minority interests; independently review each segment.", true),
    interest: metric("interest", "Cash interest / operating cash flow", "%", [80,60,40,20,5], "Cash interest / positive CFO before interest. Normalize classifications across firms; do not divide by negative CFO.")
  };
  // A pair in each pillar splits the pillar allocation 60:40.
  function profile(weights, pairs, rationale) {
    return {weights, rationale, metrics: pairs.flatMap((pair, pillar) => pair.map((id, i) => ({...M[id], pillar, weight: weights[pillar] * (i ? 0.4 : 0.6)})))};
  }
  const base = [["roce","margin"],["sales","eps"],["debt","cover"],["cash","fcf"],["pe","yield"]];
  const profiles = {
    "General corporate": profile([25,20,20,20,15], base, "Fallback for a comparable non-financial operating business; confirm business mix before use."),
    "IT services": profile([25,20,15,25,15], [["roce","margin"],["sales","eps"],["debt","cover"],["cash","fcf"],["pe","yield"]], "Capital-light businesses should convert accounting profit into distributable cash; growth must remain profitable."),
    Banks: profile([25,15,30,15,15], [["roa","roe"],["loan","deposit"],["npa","cet"],["credit","liquidity"],["pbroe","pb"]], "Asset quality and capital dominate. Deposits and liquidity replace industrial free-cash-flow tests."),
    "Non-bank lenders": profile([25,15,30,15,15], [["nbroa","roe"],["loan","eps"],["npa","capital"],["credit","alm"],["pbroe","pb"]], "Prioritize credit quality, funding and capital; compare lenders with similar collateral and borrower risk."),
    "Life insurance": profile([25,20,25,15,15], [["vnb","evgrowth"],["vnbg","ape"],["solvency","persist61"],["persist","dilution"],["pev","vnbmultiple"]], "Value creation, solvency and policy retention matter more than industrial cash flow or P/E."),
    "Financial platforms": profile([25,20,15,20,20], base, "For fee-based exchanges and asset managers. Check recurring fee mix, market-volume sensitivity and regulatory capital separately."),
    FMCG: profile([30,15,10,25,20], base, "Durable returns and cash generation carry most weight; avoid rewarding premium multiples without growth."),
    Consumer: profile([25,20,15,20,20], base, "Reward profitable expansion and cash conversion. Review leases and store-cohort economics for retailers."),
    Automobiles: profile([25,20,20,15,20], [["roce","margin"],["sales","eps"],["debt","cover"],["cash","fcf"],["ev","yield"]], "Use the manufacturing perimeter; separately value captive finance. Review model and replacement cycles."),
    Pharmaceuticals: profile([25,20,15,20,20], base, "Recurring returns, cash and growth matter; unresolved product/regulatory issues enter the risk overlay."),
    Hospitals: profile([25,20,20,20,15], [["roce","occupancy"],["sales","eps"],["debt","cover"],["cash","fcf"],["ev","yield"]], "Balance mature-facility returns against new-bed expansion; occupancy is useful only with pricing and case mix."),
    "Metals & mining": profile([20,10,30,20,20], [["roic","cycle"],["sales","eps"],["debt","cover"],["cash","fcf"],["ev","yield"]], "Cycle-normalized returns and valuation; debt resilience outweighs growth in commodity prices."),
    Cement: profile([25,15,25,15,20], [["roic","cycle"],["sales","eps"],["debt","cover"],["cash","fcf"],["ev","yield"]], "Capital intensity and the pricing cycle demand normalized margins, disciplined leverage and capex review."),
    Industrials: profile([25,20,20,20,15], [["roce","margin"],["sales","eps"],["debt","cover"],["cash","working"],["pe","yield"]], "Execution quality and receivable discipline should validate order-book growth."),
    Infrastructure: profile([20,15,30,20,15], [["roce","margin"],["sales","eps"],["debt","cover"],["cash","interest"],["ev","yield"]], "Project cash flows, debt service and concession economics outweigh headline earnings growth."),
    Power: profile([20,10,30,25,15], [["roce","margin"],["sales","eps"],["debt","cover"],["cash","working"],["ev","yield"]], "Emphasize debt service and receivable recovery; review regulated and merchant assets separately."),
    Energy: profile([20,10,25,20,25], [["roic","cycle"],["sales","eps"],["debt","cover"],["cash","fcf"],["ev","yield"]], "Normalize commodity prices, refining margins and capex; integrated groups need segment review."),
    Telecom: profile([20,20,25,20,15], [["roce","margin"],["sales","arpu"],["debt","cover"],["cash","fcf"],["ev","yield"]], "Include lease and spectrum obligations consistently. ARPU growth must translate into post-capex cash."),
    Aviation: profile([20,10,30,20,20], [["spread","load"],["sales","eps"],["debt","cover"],["cash","fcf"],["ev","yield"]], "Lease-adjusted debt and unit economics matter most. Negative equity requires a risk override."),
    Diversified: profile([20,15,25,20,20], [["roce","margin"],["sales","eps"],["debt","cover"],["cash","fcf"],["nav","yield"]], "Use conservative sum-of-the-parts valuation and consolidated debt; inspect capital allocation by segment.")
  };
  // Capital-light firms face higher return hurdles; capital-intensive businesses
  // have different margin and leverage anchors. No sector premium is automatic.
  const sectorAnchors = {
    "IT services": {roce:[0,12,22,35,50],margin:[0,10,17,23,30],debt:[3,2,1,0.5,0],pe:[60,45,32,24,16]},
    FMCG: {roce:[0,12,22,35,50],margin:[0,8,15,22,30],pe:[75,55,40,28,20]},
    Consumer: {margin:[0,4,8,13,20],pe:[65,48,34,25,18]},
    Pharmaceuticals: {margin:[0,8,15,22,30],pe:[55,40,28,20,14]},
    Hospitals: {roce:[0,6,10,15,22],ev:[35,26,20,14,9]},
    Automobiles: {margin:[0,4,8,13,18],ev:[24,18,12,8,5]},
    "Metals & mining": {debt:[4,3,2,1,0],ev:[14,11,8,6,4]},
    Cement: {cycle:[0,6,12,18,24],ev:[24,18,13,9,6]},
    Industrials: {margin:[0,4,8,12,18]},
    Infrastructure: {debt:[6,4.5,3,2,1],cover:[1,1.5,2.5,4,6]},
    Power: {roce:[0,5,9,13,18],debt:[7,5,3.5,2,1],cover:[1,1.5,2.5,4,6]},
    Energy: {ev:[16,12,9,6,4]},
    Telecom: {roce:[0,4,8,13,18],margin:[0,8,15,23,32],debt:[6,4.5,3,2,1],cover:[1,1.5,2.5,4,6],ev:[24,18,12,8,5]},
    Aviation: {ev:[20,15,11,8,5]},
    "Financial platforms": {roce:[0,10,20,35,50],margin:[0,15,30,45,60],pe:[65,48,34,25,18]}
  };
  for (const [name, changes] of Object.entries(sectorAnchors)) {
    for (const m of profiles[name].metrics) if (changes[m.id]) m.anchors = changes[m.id];
  }
  const overrides = {HDFCLIFE:"Life insurance", SBILIFE:"Life insurance", BAJFINANCE:"Non-bank lenders", SHRIRAMFIN:"Non-bank lenders", JIOFIN:"Non-bank lenders", BAJAJFINSV:"Diversified", BSE:"Financial platforms", APOLLOHOSP:"Hospitals", MAXHEALTH:"Hospitals", CIPLA:"Pharmaceuticals", DRREDDY:"Pharmaceuticals", SUNPHARMA:"Pharmaceuticals", INDIGO:"Aviation", GRASIM:"Diversified", RELIANCE:"Diversified", COALINDIA:"Metals & mining"};
  function modelFor(stock) { return overrides[stock.symbol] || (profiles[stock.sector] ? stock.sector : "General corporate"); }
  function numeric(value) { return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim()) ? Number(value) : null; }
  function grade(value, anchors) {
    const sign = anchors[4] > anchors[0] ? 1 : -1;
    const x = value * sign, a = anchors.map((n) => n * sign);
    if (x <= a[0]) return 0;
    if (x >= a[4]) return 100;
    const i = a.findIndex((n) => n >= x);
    return (i - 1) * 25 + 25 * (x - a[i - 1]) / (a[i] - a[i - 1]);
  }
  function dateAge(date, today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return null;
    const time = Date.parse(date + "T00:00:00Z");
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== date) return null;
    return (Date.parse(today + "T00:00:00Z") - time) / 86400000;
  }
  const todayIST = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  function evaluate(model, record = {}, today = todayIST()) {
    const p = profiles[model];
    if (!p) throw new Error("Unknown scoring model");
    const rows = p.metrics.map((m) => {
      const observation = record.inputs?.[m.id] || {};
      const value = numeric(observation.value);
      const age = dateAge(observation.date, today);
      const priceAge = dateAge(record.priceDate, today);
      let reason = value === null ? "Missing" : observation.verified !== true ? "Source not reviewed" : typeof observation.source !== "string" || !observation.source.trim() ? "Source reference needed" : age === null || age < 0 ? "Valid reporting date needed" : age > (m.pillar === 4 ? 200 : 550) ? "Reporting input is stale" : m.pillar === 4 && (priceAge === null || priceAge < 0 || priceAge > 7) ? "Price date must be within 7 days" : "";
      if (["pe","ev","pb","pbroe","pev"].includes(m.id) && value !== null && value <= 0) reason = "Positive denominator and multiple required";
      if (["fcf","persist","persist61","occupancy","load","npa","credit","liquidity","interest"].includes(m.id) && value !== null && (value < 0 || (["persist","persist61","occupancy","load","npa"].includes(m.id) && value > 100) || (m.id === "fcf" && (value > 5 || !Number.isInteger(value))))) reason = "Value outside valid domain";
      return {...m, value, reason, grade: reason ? null : grade(value, m.anchors), points: reason ? null : m.weight * grade(value, m.anchors) / 100};
    });
    const coverage = rows.reduce((n,r) => n + (r.grade === null ? 0 : r.weight), 0);
    const earned = rows.reduce((n,r) => n + (r.points ?? 0), 0);
    const groups = pillars.map((name,i) => ({name, weight:p.weights[i], covered:rows.filter((r)=>r.pillar===i && r.grade!==null).reduce((n,r)=>n+r.weight,0), points:rows.filter((r)=>r.pillar===i).reduce((n,r)=>n+(r.points??0),0)}));
    const complete = coverage >= 80 - 1e-8 && groups.every((g)=>g.covered >= g.weight * 0.5 - 1e-8) && rows.every((r)=>!r.critical || r.grade!==null);
    const reviewAge = dateAge(record.reviewDate, today);
    const riskReviewed = ["clear","concern","severe"].includes(record.risk) && record.riskVerified === true && typeof record.riskSource === "string" && !!record.riskSource.trim() && reviewAge !== null && reviewAge >= 0 && reviewAge <= 100;
    const flags = [];
    let cap = 100;
    if (!riskReviewed || !["clear","concern","severe"].includes(record.risk)) { cap = 69; flags.push("Governance / risk review incomplete or stale: capped at 69"); }
    if (record.risk === "concern") { cap = 59; flags.push("Material governance, regulatory or accounting concern: capped at 59"); }
    if (record.risk === "severe") { cap = 39; flags.push("Default, adverse audit, insolvency or non-positive equity: capped at 39; manual review required"); }
    const observed = (id) => rows.find((r)=>r.id===id && r.grade!==null)?.value;
    if (observed("cet") < 0 || observed("capital") < 0 || observed("solvency") < 0) { cap = Math.min(cap,39); flags.push("Reported capital / solvency below applicable minimum: capped at 39"); }
    if (observed("cover") < 1 || observed("npa") >= 4 || observed("debt") >= 5) { cap = Math.min(cap,49); flags.push("Severe leverage, debt-service or asset-quality weakness: capped at 49"); }
    const score = complete ? Math.round(Math.min(earned, cap) * 10) / 10 : null;
    const band = score === null ? "Insufficient reviewed data" : score >= 85 ? "Exceptional fundamentals" : score >= 70 ? "Strong fundamentals" : score >= 55 ? "Mixed fundamentals" : score >= 40 ? "Weak fundamentals" : "High risk / weak fundamentals";
    return {version, model, rows, groups, coverage:Math.round(coverage*10)/10, earned, score, band, flags, cap, riskReviewed, status:!complete ? "Withheld" : coverage < 100 - 1e-8 || !riskReviewed ? "Provisional" : "Reviewed inputs"};
  }
  return {version, pillars, profiles, modelFor, grade, evaluate, numeric, todayIST};
})();
if (typeof module !== "undefined") module.exports = NJScoring;
