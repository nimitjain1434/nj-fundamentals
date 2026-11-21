"use strict";

const categories = ["Operating quality", "Growth", "Financial strength", "Valuation"];
const drivers = [
  ["Strong profitability", "profitability limits the score"],
  ["Above-benchmark growth", "growth limits the score"],
  ["Strong financial position", "financial strength limits the score"],
  ["Attractive relative valuation", "valuation limits the score"]
];

function buildStock([symbol, name, sector, grades, model = sector]) {
  const scorecard = scorecards[model] ?? scorecards["General corporate"];
  const metrics = scorecard.metrics.map(([label, low, high, unit], index) => {
    const value = low + (high - low) * grades[index] / 100;
    const grade = Math.round(100 * (value - low) / (high - low));
    const weight = scorecard.weights[index];
    return { label, value, unit, grade, weight, benchmark: (low + high) / 2, points: Math.round(weight * grade / 100) };
  });
  const strongest = grades.indexOf(Math.max(...grades));
  const weakest = grades.indexOf(Math.min(...grades));
  const remark = `${drivers[strongest][0]}, while ${drivers[weakest][1]}.`;
  return { symbol, name, sector, model: scorecards[model] ? model : "General corporate", metrics, remark,
    score: metrics.reduce((sum, metric) => sum + metric.points, 0) };
}

const stocks = stockSeeds.map(buildStock);
const byName = (a, b) => a.name.localeCompare(b.name);
const byScore = (a, b) => b.score - a.score || byName(a, b);
const universe = { nifty50: stocks };
const indexSelect = document.querySelector("#index-select");
const search = document.querySelector("#search");
const sector = document.querySelector("#sector");
const sort = document.querySelector("#sort");
const rows = document.querySelector("#stock-rows");
const detail = document.querySelector("#detail");
const method = document.querySelector("#method");
const detailBody = document.querySelector("#detail-body");
const arrow = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4"/></svg>';
const metricValue = (value, unit) => value.toFixed(1) + unit;
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function tone(score) {
  if (score >= 80) return "high";
  if (score >= 65) return "mid";
  return "low";
}

function badge(stock) {
  return `<span class="stock-mark" data-sector="${escape(stock.sector)}" aria-hidden="true">${escape(stock.symbol.slice(0, 2))}</span>`;
}

function render() {
  const selected = universe[indexSelect.value];
  const query = search.value.trim().toLowerCase();
  const visible = selected.filter((stock) => {
    return (!sector.value || stock.sector === sector.value) &&
      `${stock.name} ${stock.symbol}`.toLowerCase().includes(query);
  });
  const comparators = { high: byScore, low: (a, b) => a.score - b.score || byName(a, b), name: byName };
  visible.sort(comparators[sort.value]);
  rows.innerHTML = visible.map((stock) => `
    <tr data-symbol="${escape(stock.symbol)}">
      <td><div class="company">${badge(stock)}<div><strong>${escape(stock.name)}</strong><div class="company-meta">${escape(stock.symbol)} <span>·</span> ${escape(stock.sector)}</div></div></div></td>
      <td><div class="score-cell"><span class="score ${tone(stock.score)}">${stock.score}<small>/100</small></span><span class="score-track ${tone(stock.score)}" aria-hidden="true"><i style="width:${stock.score}%"></i></span></div></td>
      <td class="remark">${stock.remark}</td>
      <td class="action"><button type="button" class="details-link" data-stock="${escape(stock.symbol)}" aria-label="View details for ${escape(stock.name)}">Details ${arrow}</button></td>
    </tr>`).join("");
  document.querySelector("#empty").hidden = visible.length > 0;
  document.querySelector("#row-count").textContent = `Showing ${visible.length} of ${selected.length} companies`;
}

function showDetail(stock) {
  const peers = stocks.filter((peer) => peer.symbol !== stock.symbol && peer.sector === stock.sector && peer.model === stock.model).sort(byScore);
  const peg = stock.model === "IT services" ? stock.metrics[3].value / stock.metrics[1].value : null;
  detailBody.innerHTML = `
    <div class="detail-name">${badge(stock)}<div><h2 id="detail-title">${escape(stock.name)}</h2><p>${escape(stock.symbol)} · NSE · ${escape(stock.sector)}</p></div></div>
    <div class="detail-score">
      <div><div class="eyebrow">NJ FUNDAMENTAL SCORE</div><strong>${stock.score}<small> / 100</small></strong></div>
      <span class="demo-pill">ILLUSTRATIVE</span>
    </div>
    <div class="why"><h3>What drives the score</h3><p>${stock.remark}</p></div>
    <div class="subhead"><h3>Score breakdown</h3><span>${escape(stock.model)} model</span></div>
    <div class="breakdown">${stock.metrics.map((metric, index) => `
      <div class="pillar">
        <div class="pillar-title"><strong>${categories[index]}</strong><span>${metric.points}<small> / ${metric.weight} pts</small></span></div>
        <div class="score-track ${tone(metric.grade)}" aria-hidden="true"><i style="width:${metric.grade}%"></i></div>
        <div class="pillar-metric"><span>${metric.label}</span><span><strong>${metricValue(metric.value, metric.unit)}</strong> <small>vs ${metricValue(metric.benchmark, metric.unit)} demo benchmark</small></span></div>
      </div>`).join("")}</div>
    ${peg === null ? "" : `<div class="peg"><span>Historical PEG <small>Trailing P/E ÷ 3-year annual EPS growth</small></span><strong>${peg.toFixed(2)}</strong></div>`}
    <h3>Compare similar companies</h3>
    ${peers.length ? `<div class="peers">${peers.map((peer) => `<button type="button" data-stock="${escape(peer.symbol)}"><span>${escape(peer.name)}</span><strong>${peer.score}<small> / 100</small></strong>${arrow}</button>`).join("")}</div>` : '<p class="dialog-intro">This snapshot has no other companies with the same sector and scorecard.</p>'}
    <button type="button" class="financial-link" data-financials="${escape(stock.symbol)}">View actual Upstox financials ↗</button>
    <p class="dialog-foot">Sample values and remarks for interface testing. Actual source financials open separately.</p>`;
  if (!detail.open) detail.showModal();
  detail.scrollTop = 0;
  detail.querySelector(".close").focus();
}

for (const name of [...new Set(stocks.map((stock) => stock.sector))].sort()) {
  sector.add(new Option(name, name));
}

const sorted = [...stocks].sort(byScore);
const middle = Math.floor(sorted.length / 2);
const median = sorted.length % 2 ? sorted[middle].score : (sorted[middle - 1].score + sorted[middle].score) / 2;
document.querySelector("#total-stocks").textContent = stocks.length;
document.querySelector("#median-score").innerHTML = `${median}<small> / 100</small>`;
document.querySelector("#high-scores").textContent = stocks.filter((stock) => stock.score >= 80).length;
document.querySelector("#method-rows").innerHTML = Object.entries(scorecards).map(([name, { weights }]) =>
  `<tr><th scope="row">${escape(name)}</th>${weights.map((weight) => `<td>${weight}</td>`).join("")}</tr>`).join("");

search.addEventListener("input", render);
for (const select of [indexSelect, sector, sort]) select.addEventListener("change", render);
document.querySelector("#reset").addEventListener("click", () => {
  search.value = "";
  sector.value = "";
  sort.value = "high";
  render();
  search.focus();
});

for (const container of [rows, detailBody]) {
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stock]");
    const symbol = button?.dataset.stock ?? event.target.closest("[data-symbol]")?.dataset.symbol;
    const stock = stocks.find((item) => item.symbol === symbol);
    if (stock) showDetail(stock);
  });
}
for (const id of ["method-header", "method-footer"]) {
  document.querySelector(`#${id}`).addEventListener("click", () => method.showModal());
}
for (const dialog of [detail, method]) {
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close();
  });
}

render();
