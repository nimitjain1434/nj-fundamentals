"use strict";
(() => {
  const section = document.getElementById("website-publishing");
  const button = document.getElementById("publish-website");
  const status = document.getElementById("website-publish-status");
  if (window.NJ_HOSTED) {
    section.hidden = true;
    document.getElementById("data-settings").hidden = true;
    document.getElementById("refresh-financials").hidden = true;
    document.getElementById("refresh-prices").hidden = true;
    document.getElementById("price-score-status").textContent = "Published prices; see each scorecard for the exchange trade time.";
    document.querySelector(".status").textContent = "PUBLISHED SNAPSHOT";
    return;
  }
  async function poll() {
    try {
      const response = await fetch("/api/website-status", {cache:"no-store"});
      if (!response.ok) throw new Error("Reopen NJ Fundamentals using the desktop shortcut to enable website publishing.");
      const result = await response.json();
      status.textContent = result.message;
      button.disabled = result.state === "running";
      if (result.state === "running") setTimeout(poll, 2000);
      if (result.state === "success") {
        const link = document.createElement("a");
        link.href = result.url; link.target = "_blank"; link.rel = "noopener";
        link.textContent = " Open website"; status.append(link);
      }
    } catch (error) {status.textContent = error.message; button.disabled = false;}
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Starting refresh and publication…";
    try {
      const response = await fetch("/api/publish-website", {
        method:"POST", headers:{"Content-Type":"application/json", "X-NJ-Request":"1"}, body:"{}"
      });
      if (!response.ok) throw new Error("Could not start publishing. Reopen the app using its desktop shortcut.");
      await poll();
    } catch (error) {status.textContent = error.message; button.disabled = false;}
  });
  poll();
})();
