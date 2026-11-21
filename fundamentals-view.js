"use strict";

// Pure data interpretation, shared with regression checks. No scoring or imputed values.
const NJDataView = (() => {
  function numeric(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(value.trim())) return null;
    return Number(value.trim().replace("%", ""));
  }
  function periodKey(period) {
    const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/.exec(period || "");
    return match ? Number(match[2]) * 12 + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[1]) : null;
  }
  function periods(rows) {
    return [...new Set(rows.flatMap((r) => (r.history || []).map((h) => h.period)).filter((p) => periodKey(p) !== null))]
      .sort((a, b) => periodKey(b) - periodKey(a));
  }
  function ownership(data) {
    const rows = Array.isArray(data) ? data.filter((r) => r && Array.isArray(r.history)) : [];
    const dates = periods(rows);
    const labels = {promoters: "Promoters", fii: "Foreign institutions (FII)", other_dii: "Other domestic institutions", mutual_funds: "Mutual funds", retail_and_other: "Retail and others"};
    const valueAt = (row, date) => {
      const value = numeric(row.history.find((h) => h.period === date)?.value);
      return value !== null && value >= 0 && value <= 100 ? value : null;
    };
    return {periods: dates, latest: dates[0], previous: dates[1], rows: rows.map((row) => {
      const values = dates.map((date) => valueAt(row, date));
      // A change is quarter-on-quarter only for adjacent quarters with both observations.
      const comparable = dates.length > 1 && periodKey(dates[0]) - periodKey(dates[1]) === 3 && values[0] !== null && values[1] !== null;
      return {label: labels[row.category] || row.category || "Other", values, change: comparable ? values[0] - values[1] : null};
    })};
  }
  function coverage(stock, sections) {
    const raw = (name) => sections[name]?.data;
    const ratios = Array.isArray(raw("ratios")) ? raw("ratios") : [];
    const findings = [];
    function add(metric, status, evidence) { findings.push({metric, status, evidence}); }
    function ratio(metric, name) {
      const row = ratios.find((r) => r.name === name);
      if (numeric(row?.company_value) !== null) add(metric, "Available", `Upstox key ratios: ${name} = ${row.company_value}. Reporting basis/date needs verification.`);
      else add(metric, "Missing", `${name} was not supplied in this company's key ratios.`);
    }
    const annual = raw("income");
    const annualRows = Array.isArray(annual?.full_statement) ? annual.full_statement : [];
    const revenue = annualRows.find((r) => r.particular === "Revenue");
    const eps = annualRows.find((r) => r.particular === "EPS - Diluted");
    function growth(metric, row, label) {
      const dates = periods(row ? [row] : []);
      const latest = dates[0];
      const base = dates.find((p) => periodKey(latest) - periodKey(p) === 36);
      const endValue = numeric(row?.history?.find((h) => h.period === latest)?.value);
      const startValue = numeric(row?.history?.find((h) => h.period === base)?.value);
      if (base && endValue > 0 && startValue > 0) add(metric, "Derivable", `${label}: ${base} to ${latest}. Requires consistent definitions and corporate-action checks.`);
      else add(metric, "Missing", `Need positive, comparable ${label} observations exactly three years apart.`);
    }
    function cashConversion() {
      const flow = raw("cash");
      const cfo = flow?.cash_flow?.find((r) => r.category === "operating");
      const pat = annualRows.find((r) => r.particular === "Profit After Tax");
      const latest = periods(pat ? [pat] : [])[0];
      const profit = numeric(pat?.history?.find((h) => h.period === latest)?.value);
      const cash = numeric(cfo?.history?.find((h) => h.period === latest)?.value);
      if (latest && profit > 0 && cash !== null && annual?.type === "consolidated" && flow?.type === "consolidated" && annual.units_in === flow.units_in) {
        add("Cash conversion", "Derivable", `Operating cash flow / PAT in ${latest}; same period, basis and units. Definition still needs validation.`);
      } else add("Cash conversion", "Missing", "Need matching consolidated operating cash flow and positive PAT for the latest annual period, in the same units.");
    }
    if (stock.model === "IT services") {
      add("Operating margin", "Needs review", "The provider's operating-profit summary matched its profit-before-tax row in tested annual responses. Operating profit must be verified first.");
      growth("3-year EPS growth", eps, "diluted EPS");
      cashConversion(); ratio("Trailing P/E", "P/E");
    } else if (["Banks", "Non-bank lenders"].includes(stock.model)) {
      ratio("Return on assets", "ROA");
      add(stock.model === "Banks" ? "Loan growth" : "Loan book growth", "Missing", "A comparable loan-book history has not been identified in the connected statements.");
      ratio("Net non-performing loans", "Net NPA");
      const pb = numeric(ratios.find((r) => r.name === "P/B")?.company_value);
      const roe = numeric(ratios.find((r) => r.name === "ROE")?.company_value);
      add("Price-to-book per 10% ROE", pb > 0 && roe > 0 ? "Derivable" : "Missing", pb > 0 && roe > 0 ? "P/B and positive ROE supplied; valuation date and ROE basis need verification." : "Need positive P/B and ROE on a consistent basis.");
    } else if (stock.model === "Metals & mining") {
      add("5-year median operating margin", "Missing", "Need at least five annual periods and verified operating profit; the pilot returned four annual periods.");
      growth("3-year revenue growth", revenue, "revenue excluding other income");
      add("Net debt / EBITDA", "Missing", "Verified borrowings, cash and EBITDA have not been identified. Total liabilities cannot substitute for debt.");
      add("Mid-cycle EV / EBITDA", "Missing", "Current EV/EBITDA alone does not establish normalized mid-cycle earnings.");
    } else if (stock.model === "Insurance") {
      for (const metric of ["New business margin", "New business value growth", "Solvency ratio", "Price / embedded value"]) add(metric, "Missing", "This insurance-specific input has not been identified in the connected responses; company disclosures are needed.");
    } else {
      add("Return on invested capital", "Missing", "Verified NOPAT and invested capital are not mapped. ROCE is a different metric.");
      growth("3-year revenue growth", revenue, "revenue excluding other income");
      add("Interest coverage", "Missing", "Verified EBIT and finance costs have not been identified in the connected statements.");
      ratio("Trailing P/E", "P/E");
    }
    return findings;
  }
  return {numeric, periodKey, ownership, coverage};
})();
if (typeof module !== "undefined") module.exports = NJDataView;
