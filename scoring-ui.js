"use strict";
const escape = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const stocks = stockSeeds.map(([symbol,name,sector])=>({symbol,name,sector,model:NJScoring.modelFor({symbol,sector})}));
const byName = (a,b)=>a.name.localeCompare(b.name);
const $ = (id)=>document.getElementById(id);
const detailBody=$("detail-body"), detail=$("detail"), method=$("method");
const storageKey=`nj-scoring-v${NJScoring.version}`;
let records={}, storageError="";
try {const saved=JSON.parse(localStorage.getItem(storageKey)||"{}");if(saved&&typeof saved==="object"&&!Array.isArray(saved))records=saved;} catch {storageError="Saved inputs could not be read.";}
function recordFor(s){const r=records[s.symbol];return r&&typeof r==="object"?r:{};}
function modelFor(s){const m=recordFor(s).model;return NJScoring.profiles[m]?m:s.model;}
const automaticPayloads = new Map();
const automaticResults = new Map();
const automaticRequests = new Map();
const automaticErrors = new Map();
let stopAutomaticDownloads = false;
function resultFor(s){return automaticResults.get(s.symbol)||NJAutoScore.evaluate(s,{});}
const byScore=(a,b)=>(resultFor(b).score??-1)-(resultFor(a).score??-1)||byName(a,b);
const num=(n)=>Number(n.toFixed(2)).toString();
const tone=(n)=>n>=70?"high":n>=55?"mid":"low";
function badge(s){return `<span class="stock-mark" data-sector="${escape(s.sector)}" aria-hidden="true">${escape(s.symbol.slice(0,2))}</span>`;}
function render(){
  const q=$("search").value.trim().toLowerCase();
  const visible=stocks.filter((s)=>(!$("sector").value||s.sector===$("sector").value)&&`${s.name} ${s.symbol}`.toLowerCase().includes(q));
  visible.sort({high:byScore,low:(a,b)=>(resultFor(a).score??Infinity)-(resultFor(b).score??Infinity)||byName(a,b),name:byName}[$("sort").value]);
  $("stock-rows").innerHTML=visible.map((s)=>{const r=resultFor(s), downloaded=automaticPayloads.has(s.symbol), loading=automaticRequests.has(s.symbol);return `<tr data-symbol="${s.symbol}"><td><div class="company">${badge(s)}<div><strong>${escape(s.name)}</strong><div class="company-meta">${escape(s.symbol)} · ${escape(s.model)}</div>${r.price?.value>0?`<div class="price-inline">₹${num(r.price.value)} <small>${window.NJ_HOSTED?"at publication":"latest traded"}</small></div>`:""}</div></div></td><td>${r.score===null?`<span class="unscored">${loading?"Loading…":downloaded?"Price / data pending":"Awaiting download"}</span>`:`<span class="score ${tone(r.score)}">${r.score}<small>/100</small></span>`}<div class="data-meta">${r.coverage}% coverage · ${escape(r.status)}</div>${r.businessScore!==null?`<div class="mini-scores">Business ${r.businessScore} · Value ${r.valuationScore??"—"}</div>`:""}</td><td class="remark">${escape(automaticErrors.get(s.symbol)||(downloaded?r.band:"Financial data downloads automatically. No entry required."))}</td><td class="action"><button class="details-link" type="button" data-stock="${s.symbol}">Scorecard →</button></td></tr>`;}).join("");
  $("empty").hidden=visible.length>0;$("row-count").textContent=`Showing ${visible.length} of ${stocks.length} companies`;
  const scored=stocks.map(resultFor).filter((r)=>r.score!==null).sort((a,b)=>a.score-b.score), mid=Math.floor(scored.length/2);
  $("total-stocks").textContent=stocks.length;$("median-score").textContent=!scored.length?"—":num(scored.length%2?scored[mid].score:(scored[mid-1].score+scored[mid].score)/2);
  $("high-scores").textContent=scored.filter((r)=>r.score>=85).length;
}
function resultHTML(r){if(r.automatic)return automaticResultHTML(r);return `<div class="detail-score"><div><div class="eyebrow">NJ FUNDAMENTAL SCORE · v${r.version}</div><strong>${r.score??"—"}<small> / 100</small></strong></div><span class="demo-pill">${escape(r.status.toUpperCase())}</span></div><p class="dialog-intro"><strong>${escape(r.band)}</strong> · ${r.coverage}% of model weight covered. Input review is the user's assessment.</p>${r.flags.length?`<ul class="risk-flags">${r.flags.map((f)=>`<li>${escape(f)}</li>`).join("")}</ul>`:""}<div class="breakdown">${r.groups.map((g)=>`<div class="pillar"><div class="pillar-title"><strong>${g.name}</strong><span>${num(g.points)} / ${g.weight} points</span></div><div class="score-track ${tone(g.points/g.weight*100)}"><i style="width:${g.points/g.weight*100}%"></i></div><small class="data-meta">${num(g.covered)} / ${g.weight} weight covered</small></div>`).join("")}</div><p class="dialog-foot">${r.score===null?"Score requires ≥80% weight coverage, ≥50% in every pillar and all critical metrics. ":""}Missing weight earns no points and is never redistributed. Pillar points are before risk caps. ${r.score===null?"":`Before caps: ${num(r.earned)}; cap: ${r.cap}. `}No return forecast or buy/sell recommendation.</p>`;}
function showManualDetail(s,notice=""){
  const record=recordFor(s),r=NJScoring.evaluate(modelFor(s),record),p=NJScoring.profiles[r.model];
  detailBody.innerHTML=`<div class="detail-name">${badge(s)}<div><h2 id="detail-title">${escape(s.name)}</h2><p>${escape(s.symbol)} · ${escape(s.sector)}</p></div></div>${resultHTML(r)}<p class="dialog-intro">${escape(p.rationale)}</p><div class="data-actions"><button type="button" data-financials="${s.symbol}">View Upstox financials</button></div>
  <h3>Source-reviewed scoring inputs</h3><p class="dialog-intro">Use consistent consolidated accounts unless the model requires a segment or regulated entity. Enter 15 for 15%, and 2.5 for a 2.5× multiple. Multi-year dates refer to the latest period end. Valuation also requires a current price date.</p>
  <form id="score-form" data-symbol="${s.symbol}"><label class="score-label" for="score-model">Business model</label><select id="score-model">${Object.keys(NJScoring.profiles).map((n)=>`<option${n===r.model?" selected":""}>${escape(n)}</option>`).join("")}</select><p class="data-meta">Save before switching model. The editor keeps saved values shared by both models.</p>
  <div class="score-defaults"><label>Default reporting date<input type="date" id="score-date" value="${escape(record.defaultDate||"")}"></label><label>Price / market-cap date<input type="date" id="price-date" value="${escape(record.priceDate||"")}"></label></div><label class="score-label">Default source reference<input id="score-source" type="text" placeholder="Annual report URL and pages; results presentation and pages" value="${escape(record.defaultSource||"")}"></label>
  ${NJScoring.pillars.map((name,i)=>`<fieldset class="score-pillar"><legend>${name} · ${p.weights[i]}%</legend>${r.rows.filter((m)=>m.pillar===i).map((m)=>{const input=record.inputs?.[m.id]||{};return `<div class="score-input-row"><label for="metric-${m.id}">${escape(m.label)}${m.critical?" *":""}<small>${num(m.weight)}% weight · ${escape(m.unit)}</small></label><input id="metric-${m.id}" type="number" step="any" inputmode="decimal" value="${escape(input.value??"")}" placeholder="Missing"><p class="data-meta">${escape(m.definition)}</p><p class="anchor-line">0 / 25 / 50 / 75 / 100 score at: ${m.anchors.map(num).join(" / ")} ${escape(m.unit)}</p><details><summary>Source and date override · ${escape(m.reason||"Reviewed")}</summary><label>Source<input id="source-${m.id}" type="text" value="${escape(input.source||"")}" placeholder="Uses default if blank"></label><label>Period end<input id="date-${m.id}" type="date" value="${escape(input.date||"")}"></label></details></div>`;}).join("")}</fieldset>`).join("")}
  <label class="review-check"><input id="inputs-reviewed" type="checkbox" required> I checked every entered value, its definition, source, dates, units, positive denominators and comparable history. * Critical metrics are mandatory for a score.</label>
  <h3>Governance and exceptional risks</h3><p class="dialog-intro">Review audit opinions, defaults, equity, promoter pledging, related-party transactions, dilution, regulatory actions and capital allocation. Promoter ownership and institutional buying alone earn no points.</p><label class="score-label">Risk assessment<select id="risk-level"><option value="unknown">Not reviewed</option><option value="clear"${record.risk==="clear"?" selected":""}>Reviewed: no material issue identified</option><option value="concern"${record.risk==="concern"?" selected":""}>Material concern (cap 59)</option><option value="severe"${record.risk==="severe"?" selected":""}>Default / adverse audit / insolvency / non-positive equity (cap 39)</option></select></label><label class="score-label">Risk review sources and notes<input id="risk-source" type="text" value="${escape(record.riskSource||"")}" placeholder="Dated disclosures and supporting evidence"></label><label class="score-label">Risk review date<input id="risk-date" type="date" value="${escape(record.reviewDate||"")}"></label><label class="review-check"><input type="checkbox" id="risk-reviewed"${record.riskVerified?" checked":""}> I reviewed risk disclosures (valid for 100 days).</label><div class="data-actions"><button type="submit">Save and calculate</button><button type="button" id="clear-score">Clear saved inputs</button></div><p id="score-message" role="status">${escape(notice||storageError)}</p><p class="dialog-foot">Saved in this browser on this computer. No score is inferred from demo data or an unverified provider ratio.</p></form>`;
  $("score-form").addEventListener("submit",saveInputs);
  $("score-model").addEventListener("change",(event)=>{records[s.symbol]={...record,model:event.target.value};showManualDetail(s);});
  $("clear-score").addEventListener("click",()=>{delete records[s.symbol];persist();render();showManualDetail(s,"Inputs cleared.");});
  if(!detail.open)detail.showModal();
}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(records));storageError="";}catch{storageError="Browser storage unavailable. Changes are kept for this session only.";}}
function saveInputs(event){
  event.preventDefault();const s=stocks.find((s)=>s.symbol===event.currentTarget.dataset.symbol),model=$("score-model").value;
  const value=(id)=>$(id).value.trim(),defaultDate=value("score-date"),defaultSource=value("score-source");
  const inputs=Object.fromEntries(NJScoring.profiles[model].metrics.map((m)=>[m.id,{value:value(`metric-${m.id}`),source:value(`source-${m.id}`)||defaultSource,date:value(`date-${m.id}`)||defaultDate,verified:$("inputs-reviewed").checked}]));
  records[s.symbol]={model,inputs,defaultDate,defaultSource,priceDate:value("price-date"),risk:value("risk-level"),riskSource:value("risk-source"),reviewDate:value("risk-date"),riskVerified:$("risk-reviewed").checked};
  persist();render();showManualDetail(s,storageError||"Saved. Score and coverage updated.");detail.scrollTop=0;
}

function automaticResultHTML(r){
  const date=(v)=>v?new Date(v*1000).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})+" IST":"Not downloaded";
  return `<div class="detail-score"><div><div class="eyebrow">PRICE-AWARE FUNDAMENTAL SCORE · v${r.version}</div><strong>${r.score??"—"}<small> / 100</small></strong></div><span class="demo-pill">${r.coverage<99.99?"PROVISIONAL":"SCREENING"}</span></div>
  <div class="score-summary"><article><span>BUSINESS STRENGTH</span><strong>${r.businessScore??"—"}<small> / 100</small></strong><p>Observed financial metrics · ${num(r.businessCovered||0)} / 60 weight available</p></article><article><span>PRICE VALUE</span><strong>${r.valuationScore??"—"}<small> / 100</small></strong><p>40% of final score · lower earnings multiples score higher</p></article></div>
  <div class="price-summary"><div><span>Latest traded price</span><strong>${r.price?.value>0?`₹${num(r.price.value)}`:"Unavailable"}</strong></div><div><span>Price / annual EPS</span><strong>${r.price?.multiple>0?`${num(r.price.multiple)}×`:"Unavailable"}</strong></div><div><span>Annual diluted EPS</span><strong>${r.price?.eps>0?`₹${num(r.price.eps)}`:"Unavailable"}</strong></div></div>
  <p class="data-meta">Price last traded: ${escape(date(r.price?.tradeAt))}. Quote retrieved: ${escape(date(r.price?.fetched_at))}. Earnings year ended ${escape(r.price?.period||"not supplied")}. Annual EPS, not TTM or forecast EPS.</p>
  <p class="dialog-intro">${r.coverage}% weight coverage · ${r.rows.filter((m)=>m.grade!==null).length} of ${r.rows.length} inputs. ${escape(r.band)}.</p>
  <p class="dialog-intro">${r.score===null?"A recent valid quote, positive comparable annual EPS, at least 50% weight and four inputs across three pillars are required. No figures need to be entered.":`${num(r.groups.slice(0,4).reduce((a,g)=>a+g.points,0))} business points out of 60 + ${num(r.groups[4].points)} price-value points out of 40${r.cap<100?`; score capped at ${r.cap}`:""}. Missing weight (${num(100-r.coverage)}%) stays unearned; it is never scaled up to 100%.`}</p>
  <p class="data-meta">Latest download: ${escape(date(r.retrieved))}. The full analyst assessment is incomplete, even at 100% screening coverage.</p>
  ${r.otherData?.length?`<h3>Other company data supplied by Upstox</h3><p class="dialog-intro">These generic figures are available, but do not replace VNB, solvency, persistency or embedded value in an insurance assessment.</p>${r.otherData.map((m)=>`<div class="auto-metric"><div class="pillar-title"><strong>${escape(m.label)}</strong><span>${num(m.value)} ${escape(m.unit)}</span></div><p class="data-meta">${escape(m.source)}${m.period?` · ${escape(m.period)}`:""}</p></div>`).join("")}`:""}
  <div class="breakdown">${r.groups.map((g)=>`<div class="pillar"><div class="pillar-title"><strong>${escape(g.name)}</strong><span>${num(g.points)} / ${g.weight} points</span></div><small class="data-meta">${num(g.covered)} / ${g.weight} weight available</small></div>`).join("")}</div>
  <h3>Figures used automatically</h3>${r.rows.map((m)=>`<div class="auto-metric"><div class="pillar-title"><strong>${escape(m.label)}</strong><span>${m.value===null?"Unavailable":`${num(m.value)} ${escape(m.unit)}`}</span></div><p class="data-meta">${m.grade===null?escape(m.reason):`${num(m.weight)}% weight · ${num(m.grade)} metric score · ${num(m.points)} points`}</p><details><summary>Source and calculation</summary><p class="data-meta">${escape(m.source)}${m.period?` · period ended ${escape(m.period)}`:""} · retrieved ${escape(date(m.fetched_at))}</p><p class="data-meta">${escape(m.detail)}</p><p class="anchor-line">0 / 25 / 50 / 75 / 100 anchors: ${m.anchors.map(num).join(" / ")} ${escape(m.unit)}</p></details></div>`).join("")}
  <h3>Scope of this score</h3><ul class="risk-flags">${r.flags.map((f)=>`<li>${escape(f)}</li>`).join("")}</ul><p class="dialog-foot">Compare only the same business model with similar input coverage. A high partial score does not imply that missing risk checks passed. No buy/sell recommendation.</p>`;
}
let activeAutomaticSymbol=null;
function showDetail(s){
  activeAutomaticSymbol=s.symbol;
  detailBody.innerHTML=`<div class="detail-name">${badge(s)}<div><h2 id="detail-title">${escape(s.name)}</h2><p>${escape(s.symbol)} · ${escape(s.model)}</p></div></div><p class="dialog-intro">Downloaded and calculated automatically. You do not need to enter any data.</p><p class="data-error" role="status">${escape(automaticErrors.get(s.symbol)||"")}</p>${automaticRequests.has(s.symbol)?'<p role="status">Downloading Upstox financials…</p>':""}${automaticResultHTML(resultFor(s))}<div class="data-actions"><button type="button" id="reload-auto-score">Refresh score from Upstox</button><button type="button" data-financials="${s.symbol}">View financial statements</button></div><details class="model-spec"><summary>Optional complete analyst model</summary><p class="dialog-intro">The full model needs supplementary filings. Manual entry is optional and is separate from the automatic screening score.</p><button type="button" id="open-manual-model">Open advanced analyst worksheet</button></details>`;
  if(window.NJ_HOSTED) $("reload-auto-score").hidden=true;
  $("reload-auto-score").addEventListener("click",()=>Promise.all([loadAutomatic(s,true),refreshPriceScores(true)]));
  $("open-manual-model").addEventListener("click",()=>{activeAutomaticSymbol=null;showManualDetail(s);});
  if(!detail.open)detail.showModal();
  if(!automaticPayloads.has(s.symbol)&&!automaticRequests.has(s.symbol)&&!automaticErrors.has(s.symbol))loadAutomatic(s);
}
function acceptAutomatic(payload){
  const s=stocks.find((s)=>s.symbol===payload.symbol);if(!s)return;
  payload={...automaticPayloads.get(s.symbol),...payload,sections:{...automaticPayloads.get(s.symbol)?.sections,...payload.sections}};
  automaticPayloads.set(s.symbol,payload);automaticResults.set(s.symbol,NJAutoScore.evaluate(s,payload,window.NJ_HOSTED?NJSite.publishedAt:undefined));
  const errors=Object.values(payload.sections||{}).map((section)=>section.error).filter(Boolean);
  if(errors.length)automaticErrors.set(s.symbol,[...new Set(errors)].join(" "));else automaticErrors.delete(s.symbol);
  if(errors.some((error)=>/rejected access|rate limit|first/i.test(error)))stopAutomaticDownloads=true;
  render();if(detail.open&&activeAutomaticSymbol===s.symbol)showDetail(s);
}
async function loadAutomatic(s,refresh=false){
  if(automaticRequests.has(s.symbol))return automaticRequests.get(s.symbol);
  const request=(async()=>{
    try{
      const response=await NJSite.request(`/api/scoring?symbol=${encodeURIComponent(s.symbol)}${refresh?"&refresh=1":""}`,{cache:"no-store"});
      const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Financial data could not be downloaded.");
      acceptAutomatic(payload);
    }catch(error){automaticErrors.set(s.symbol,error.message);}
    finally{automaticRequests.delete(s.symbol);render();if(detail.open&&activeAutomaticSymbol===s.symbol)showDetail(s);}
  })();
  automaticRequests.set(s.symbol,request);render();return request;
}
async function startAutomaticScores(){
  const status=$("automatic-score-status");
  try{
    const response=await NJSite.request('/api/scoring-cache',{cache:'no-store'});if(!response.ok)throw new Error(response.status===404?'This tab is connected to an older NJ server. Open the desktop shortcut again to restart it, then use the newly opened tab.':'The local scoring service could not load saved data. Reopen NJ Fundamentals from the desktop shortcut.');
    const payload=await response.json();for(const company of payload.companies||[])acceptAutomatic(company);
    if(window.NJ_HOSTED){status.textContent=`Published snapshot · ${new Date(NJSite.publishedAt*1000).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST. Scores use data available at publication, not live prices.`;return;}
    const connection=await (await NJSite.request('/api/status',{cache:'no-store'})).json();
    if(!connection.configured){status.textContent='Cached scores are shown. Connect Upstox to download the remaining companies.';return;}
    await refreshPriceScores();
    const queue=[...stocks].sort((a,b)=>(automaticPayloads.has(a.symbol)?1:0)-(automaticPayloads.has(b.symbol)?1:0)||byName(a,b));
    let done=0;
    async function worker(){while(queue.length&&!stopAutomaticDownloads){const s=queue.shift();await loadAutomatic(s);done++;status.textContent=`Automatic data loading: ${done} / ${stocks.length} checked · ${stocks.filter((s)=>resultFor(s).score!==null).length} scores calculated. No data entry required.`;}}
    await Promise.all([worker(),worker()]);
    status.textContent=stopAutomaticDownloads?'Loading paused by Upstox access or rate-limit response. Available scores remain visible; check connection settings.':`Automatic loading complete · ${stocks.filter((s)=>resultFor(s).score!==null).length} scores calculated. Any remaining gaps are listed in each scorecard.`;
  }catch(error){
    const message=error.message==='Failed to fetch'?'The local NJ scoring service is unavailable. Open the desktop shortcut to start it.':error.message;
    status.textContent=message;
    for(const s of stocks)if(!automaticPayloads.has(s.symbol))automaticErrors.set(s.symbol,message);
    render();
    for(const cell of document.querySelectorAll('#stock-rows .unscored'))cell.textContent='Service unavailable';
  }
}
async function refreshPriceScores(force=false){
  const button=$("refresh-prices"), status=$("price-score-status");
  if(button)button.disabled=true;
  if(status)status.textContent="Refreshing latest traded prices…";
  try{
    const response=await NJSite.request(`/api/prices?symbols=${encodeURIComponent(stocks.map((s)=>s.symbol).join(','))}${force?'&refresh=1':''}`,{cache:'no-store'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Quote service unavailable.');
    for(const payload of data.companies||[])acceptAutomatic(payload);
    const available=stocks.filter((s)=>resultFor(s).price?.value>0).length;
    if(status)status.textContent=`Latest traded prices available for ${available} / ${stocks.length} companies. Open a scorecard for exchange trade time and earnings basis.`;
  }catch(error){if(status)status.textContent=`Prices could not be refreshed: ${error.message}. No current-price score is fabricated.`;}
  finally{if(button)button.disabled=false;}
}
$("refresh-prices")?.addEventListener("click",()=>refreshPriceScores(true));
$("method-rows").innerHTML=Object.entries(NJScoring.profiles).map(([name,p])=>`<tr><th scope="row">${escape(name)}</th>${p.weights.map((w)=>`<td>${w}%</td>`).join("")}</tr>`).join("");
$("model-specs").innerHTML=Object.entries(NJScoring.profiles).map(([name,p])=>`<details class="model-spec"><summary>${escape(name)}</summary><p class="dialog-intro">${escape(p.rationale)}</p><div class="method-table"><table><thead><tr><th>Metric / weight</th><th>Values at 0 / 25 / 50 / 75 / 100</th></tr></thead><tbody>${p.metrics.map((m)=>`<tr><th>${escape(m.label)} · ${num(m.weight)}%${m.critical?" *":""}<p class="data-meta">${escape(m.definition)}</p></th><td>${m.anchors.map(num).join(" / ")} ${escape(m.unit)}</td></tr>`).join("")}</tbody></table></div></details>`).join("");
for(const name of [...new Set(stocks.map((s)=>s.sector))].sort())$("sector").add(new Option(name,name));
$("search").addEventListener("input",render);for(const id of ["index-select","sector","sort"])$(id).addEventListener("change",render);
$("reset").addEventListener("click",()=>{$("search").value="";$("sector").value="";$("sort").value="high";render();$("search").focus();});
$("stock-rows").addEventListener("click",(event)=>{const symbol=event.target.closest("[data-stock]")?.dataset.stock||event.target.closest("[data-symbol]")?.dataset.symbol;const s=stocks.find((s)=>s.symbol===symbol);if(s)showDetail(s);});
for(const id of ["method-header","method-footer"])$(id).addEventListener("click",()=>method.showModal());
for(const dialog of [detail,method])dialog.addEventListener("click",(event)=>{if(event.target!==dialog)return;const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();});
render();
startAutomaticScores();
