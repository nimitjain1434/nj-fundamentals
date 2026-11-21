"use strict";

(() => {
  const settings = document.querySelector("#connection-dialog");
  const financials = document.querySelector("#financials-dialog");
  const company = document.querySelector("#financial-company");
  const content = document.querySelector("#financials-content");
  const state = document.querySelector("#financials-state");
  const message = document.querySelector("#token-message");
  const tokenInput = document.querySelector("#analytics-token");
  const safe = (value) => escape(String(value ?? "—"));
  const format = (value) => typeof value === "number" ? value.toLocaleString("en-IN", {maximumFractionDigits: 2}) : String(value ?? "—");
  const date = (value) => new Date(value * 1000).toLocaleString("en-IN", {timeZone: "Asia/Kolkata"}) + " IST";

  async function api(path, body) {
    const response = await NJSite.request(path, body === undefined ? {cache: "no-store"} : {
      method: "POST", headers: {"Content-Type": "application/json", "X-NJ-Request": "1"}, body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  function showStatus(status) {
    if(window.NJ_HOSTED){
      document.querySelector("#data-settings").hidden=true;
      document.querySelector("#refresh-financials").hidden=true;
      document.querySelector("#connection-state").textContent=`Published data · ${date(NJSite.publishedAt)}. Prices and scores reflect this snapshot.`;
      return;
    }
    document.querySelector("#connection-state").textContent = status.configured
      ? "Token saved locally. Open a company to fetch its financial history."
      : "Not connected. Add your existing Analytics Token to fetch financial history.";
    document.querySelector("#data-settings").textContent = status.configured ? "Upstox settings" : "Connect Upstox";
    document.querySelector("#disconnect-upstox").disabled = !status.configured;
  }
  api("/api/status").then(showStatus).catch(() => {
    document.querySelector("#connection-state").textContent = "Data service unavailable. Close and reopen NJ Fundamentals with its desktop shortcut.";
  });

  document.querySelector("#data-settings").addEventListener("click", () => settings.showModal());
  settings.addEventListener("close", () => { tokenInput.value = ""; });
  document.querySelector("#token-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    message.textContent = "Verifying TCS ratio access with Upstox…";
    const token = tokenInput.value.trim();
    tokenInput.value = "";
    try {
      const status = await api("/api/connect", {token});
      showStatus(status);
      message.textContent = status.message;
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });
  document.querySelector("#disconnect-upstox").addEventListener("click", async () => {
    try {
      showStatus(await api("/api/disconnect", {}));
      tokenInput.value = "";
      message.textContent = "Saved token removed. Downloaded financial history remains available.";
    } catch (error) { message.textContent = error.message; }
  });

  const pilots = ["TCS", "ICICIBANK", "TATASTEEL"];
  for (const stock of [...stocks].sort((a, b) => (pilots.includes(a.symbol) ? 0 : 1) - (pilots.includes(b.symbol) ? 0 : 1) || byName(a, b))) {
    company.add(new Option(`${stock.name} (${stock.symbol})`, stock.symbol));
  }
  company.value = "TCS";
  document.querySelector("#open-financials").addEventListener("click", () => financials.showModal());

  function table(headers, records) {
    return `<div class="financial-table"><table><thead><tr>${headers.map((h) => `<th>${safe(h)}</th>`).join("")}</tr></thead><tbody>${records.map((row) => `<tr>${row.map((v) => `<td>${safe(format(v))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function history(data) {
    if (!data || typeof data !== "object") return "";
    // Upstox can return annual full_statement rows even for quarterly requests.
    // The grouped quarterly history carries the actual requested quarter dates.
    let entries = data.time_period === "quarterly" && Array.isArray(data.income_statement)
      ? data.income_statement
      : Array.isArray(data.full_statement) && data.full_statement.length ? data.full_statement : null;
    if (!entries) entries = Object.values(data).find((value) => Array.isArray(value) && value.some((r) => r && Array.isArray(r.history)));
    if (entries) {
      const periods = [...new Set(entries.flatMap((r) => (r.history || []).map((h) => h.period)).filter(Boolean))];
      return table(["Particular", ...periods], entries.map((row) => {
        const label = row.particular || row.category || row.name || "Item";
        return [/^EPS\b/i.test(label) ? `${label} (₹ / share)` : label.replaceAll("_", " "), ...periods.map((period) => (row.history || []).find((h) => h.period === period)?.value)];
      }));
    }
    if (Array.isArray(data.history) && data.history.length) {
      const keys = [...new Set(data.history.flatMap(Object.keys))];
      return table(keys, data.history.map((row) => keys.map((k) => row[k])));
    }
    return "";
  }
  function section(name, title, section) {
    if (!section) return `<section class="financial-section"><h3>${title}</h3><p>Not fetched. Resolve the connection error and refresh.</p></section>`;
    const data = section.data;
    let body = "";
    if (name === "ratios" && Array.isArray(data)) {
      body = table(["Ratio", "Company", "Sector benchmark"], data.map((r) => [r.name, r.company_value, r.sector_value]));
    } else if (name === "ownership" && Array.isArray(data)) {
      const ownership = NJDataView.ownership(data);
      const percent = (value) => value === null ? "—" : `${value.toFixed(2)}%`;
      const change = (value) => value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)} pp`;
      const promoter = ownership.rows.find((r) => r.label === "Promoters");
      body = `<p class="ownership-summary">Promoter holding: <strong>${safe(percent(promoter?.values[0] ?? null))}</strong>${ownership.latest ? ` as of ${safe(ownership.latest)}` : ""}. Latest quarter change: <strong>${safe(change(promoter?.change ?? null))}</strong>.</p>`;
      if (ownership.periods.length) body += table(["Shareholder", ...ownership.periods, "Latest QoQ change (pp)"], ownership.rows.map((row) => [row.label, ...row.values.map(percent), change(row.change)]));
      else body += "<p>No dated ownership observations were returned.</p>";
      body += '<p class="data-meta">pp = percentage points. Mutual funds are shown separately from other DII. A dash means missing or non-comparable observations. Promoter pledging is not supplied by this endpoint.</p>';
    } else if (name === "profile" && data && typeof data === "object") {
      body = `<p class="company-description">${safe(data.company_profile || "No business description supplied.")}</p><p>Provider sector: <strong>${safe(data.sector)}</strong></p>`;
      if (data.sector_market_cap_inr) body += `<p class="data-meta">Sector market capitalisation: ${safe(data.sector_market_cap_inr.formatted || `${format(data.sector_market_cap_inr.value)} ${data.sector_market_cap_inr.unit || ""}`)}. This is the sector total.</p>`;
    } else if (name === "actions" && Array.isArray(data)) {
      body = data.length ? data.map((event) => `<details class="corporate-event"><summary>${safe(event.name)} · ${safe(event.expiry_date)}${event.amount === null || event.amount === undefined ? "" : ` · Amount ₹${safe(format(event.amount))}`}${event.ratio ? ` · ${safe(event.ratio)}` : ""}</summary>${table(["Event detail", "Value"], (Array.isArray(event.event_details) ? event.event_details : []).map((item) => [item.name, item.value]))}</details>`).join("") : "<p>No corporate actions were returned. This does not establish that the company has never had corporate actions.</p>";
      body += '<p class="data-meta">Dates, amounts and ratios are displayed as supplied by Upstox. Dividend amounts are per share; these are not full dividend-history or corporate-action-adjustment guarantees.</p>';
    } else body = history(data);
    const units = name === "ownership" ? " · Ownership in %; changes in percentage points" : ["ratios", "profile", "actions"].includes(name) ? "" : ` · Monetary units: ${safe(data?.units_in || "not supplied; see source response")}; EPS in ₹ / share`;
    return `<section class="financial-section"><h3>${title}</h3>
      ${section.error ? `<p class="data-error">${safe(section.error)} ${data ? "Showing previous download." : ""}</p>` : ""}
      ${section.fetched_at ? `<p class="data-meta">Retrieved ${safe(date(section.fetched_at))} · ${section.cached ? "Local cache" : "Downloaded now"}${units}</p>` : ""}
      ${name === "quarterly" ? "<p class=\"data-meta\">Quarterly summary from the provider. Detailed source rows may use a different reporting frequency.</p>" : ""}
      ${body || "<p>No financial rows available in this response.</p>"}
      ${data ? `<details><summary>View source response</summary><pre>${safe(JSON.stringify(data, null, 2))}</pre></details>` : ""}</section>`;
  }
  function coverage(stock, sections) {
    const result = resultFor(stock);
    return `<section class="financial-section coverage-section"><h3>Sector scorecard · ${safe(result.model)}</h3>
      ${resultHTML(result)}
      ${table(["Model input", "Weight", "Input status"], result.rows.map((r) => [r.label, `${r.weight}%`, r.reason || "Provider input / derived automatically"]))}
      <p class="data-meta">This indicative score is calculated automatically from available Upstox inputs. Reporting limitations and unsupported specialist fields are shown above. No manual data entry is required.</p>
      <button type="button" data-edit-score="${safe(stock.symbol)}">Open automatic scorecard</button></section>`;
  }
  /* Legacy provider coverage mapping retained in NJDataView for source diagnostics. */
  function legacyCoverage(stock, sections) {
    const findings = NJDataView.coverage(stock, sections);
    const rows = findings.map((f) => [f.metric, f.status, f.evidence]);
    const missing = findings.filter((f) => f.status === "Missing").length;
    const review = findings.filter((f) => f.status === "Needs review").length;
    const old = Object.values(sections).some((s) => s.error || (s.fetched_at && Date.now() / 1000 - s.fetched_at > 86400));
    return `<section class="financial-section coverage-section"><h3>Scoring data coverage · ${safe(stock.model)}</h3>
      <p><strong>Insufficient verified data for an actual NJ score.</strong> Of ${findings.length} model inputs, ${missing} are missing and ${review} need source review. Available and derivable inputs still require validation.</p>
      ${old ? '<p class="data-error">Some source sections are unavailable or contain an older download. Check their retrieval times and errors below.</p>' : ""}
      ${table(["Model input", "Coverage", "Evidence / next step"], rows)}
      <p class="data-meta">Available = a provider value exists. Derivable = candidate inputs exist. Neither means independently verified. Missing values are never filled with zero. The screener continues to show its labelled demo scores.</p>
      <p class="data-meta">Supplementary sources needed: promoter pledging and governance disclosures; longer financial history; detailed debt and finance costs; insurance solvency, new-business and embedded-value disclosures.</p>
      </section>`;
  }
  let loading = false;
  content.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-score]");
    if (!button) return;
    const stock = stocks.find((s) => s.symbol === button.dataset.editScore);
    if (stock) { financials.close(); showDetail(stock); }
  });
  async function load(refresh = false) {
    if (loading) return;
    loading = true;
    const symbol = company.value;
    const buttons = [document.querySelector("#load-financials"), document.querySelector("#refresh-financials")];
    buttons.forEach((button) => { button.disabled = true; });
    company.disabled = true;
    content.replaceChildren();
    state.textContent = `Loading ${symbol} financials. First download may take a minute…`;
    try {
      const data = refresh ? await api("/api/refresh", {symbol}) : await api(`/api/financials?symbol=${encodeURIComponent(symbol)}`);
      const errors = Object.values(data.sections).some((s) => s.error);
      const available = Object.values(data.sections).some((s) => Array.isArray(s.data) ? s.data.length > 0 : s.data && Object.keys(s.data).length > 0);
      state.textContent = `${data.symbol} · ${data.isin} · ${available ? (errors ? "Some data unavailable; see each section." : "Financial data loaded.") : "No financial data loaded; check the connection."}`;
      const stock = stocks.find((s) => s.symbol === symbol);
      acceptAutomatic(data);
      content.innerHTML = section("profile", "Company profile", data.sections.profile)
        + section("ownership", "Shareholding history", data.sections.ownership)
        + coverage(stock, data.sections)
        + Object.entries({ratios: "Key ratios", actions: "Corporate actions", income: "Annual income statement", quarterly: "Quarterly income statement", balance: "Balance sheet", cash: "Cash flow"})
          .map(([name, title]) => section(name, title, data.sections[name])).join("");
    } catch (error) { state.textContent = error.message; }
    finally {
      loading = false;
      company.disabled = false;
      buttons.forEach((button) => { button.disabled = false; });
    }
  }
  document.querySelector("#load-financials").addEventListener("click", () => load());
  document.querySelector("#refresh-financials").addEventListener("click", () => load(true));
  company.addEventListener("change", () => { content.replaceChildren(); state.textContent = "Select Load financials to view this company."; });
  detailBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-financials]");
    if (!button) return;
    company.value = button.dataset.financials;
    financials.showModal();
    load();
  });
})();
