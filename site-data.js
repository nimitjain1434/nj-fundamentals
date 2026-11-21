"use strict";
window.NJSite = (() => {
  let pending;
  async function snapshot() {
    if (!pending) pending = fetch(new URL("snapshot.json", document.baseURI), {cache:"no-store"})
      .then(async response => {
        if (!response.ok) throw new Error("The published data snapshot could not be loaded. Please reload later.");
        const data = await response.json();
        if (data.version !== 1 || !Number.isFinite(data.published_at) || !Array.isArray(data.companies))
          throw new Error("The published data snapshot is invalid.");
        window.NJSite.publishedAt = data.published_at;
        return data;
      }).catch(error => { pending = null; throw error; });
    return pending;
  }
  async function request(path, options) {
    if (!window.NJ_HOSTED) return fetch(path, options);
    const data = await snapshot(), url = new URL(path, document.baseURI);
    let payload;
    if (url.pathname === "/api/status") payload = {configured:false, hosted:true};
    else if (url.pathname === "/api/scoring-cache" || url.pathname === "/api/prices") payload = {companies:data.companies};
    else if (["/api/scoring", "/api/financials", "/api/refresh"].includes(url.pathname)) {
      const symbol = url.searchParams.get("symbol") || JSON.parse(options?.body || "{}").symbol;
      payload = data.companies.find(c => c.symbol === symbol);
      if (!payload) return new Response(JSON.stringify({error:"This company has no published financial data yet."}), {status:404});
    } else return new Response(JSON.stringify({error:"Update data from the owner's local app."}), {status:403});
    return new Response(JSON.stringify(payload), {status:200, headers:{"Content-Type":"application/json"}});
  }
  return {request, snapshot, publishedAt:null};
})();
