// reinpay.app/chain: holders and total REINPAY burned over time, one point per hour, from assets/chain/history.json
// (written by the on-chain job from the token's own Transfer logs). Drawn on a canvas; hover or tap to read a point.
(() => {
  const box = document.getElementById("hist"); if (!box) return;
  const cv = document.getElementById("hist-canvas"), g = cv.getContext("2d"), tip = document.getElementById("hist-tip");
  const tabs = [...box.querySelectorAll("[data-series]")];
  let P = [], series = "holders", hover = -1, W = 0, H = 0;
  const COL = { holders: "#5ff0a8", burned: "#e2b057" };
  const fmt = (v, s) => (s === "burned" ? (v / 1e6).toFixed(2) + "M" : Math.round(v).toLocaleString("en-US"));
  const when = (t) => t.slice(5, 16).replace("T", " ") + " UTC";
  function fit() { const d = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); draw(); }
  function draw() {
    g.clearRect(0, 0, W, H); if (!P.length) return;
    const L = 58, R = 18, T = 18, B = 34, col = COL[series];
    const vals = P.map((p) => p[series]), lo0 = Math.min(...vals), hi0 = Math.max(...vals), padv = (hi0 - lo0) * .12 || hi0 * .05 || 1;
    const lo = Math.max(0, lo0 - padv), hi = hi0 + padv;
    const x = (i) => L + (i / Math.max(1, P.length - 1)) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    g.font = '500 11px "IBM Plex Mono", monospace'; g.fillStyle = "#6f8a7d"; g.strokeStyle = "rgba(95,240,168,.08)"; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const v = lo + ((hi - lo) * k) / 4, yy = y(v); g.beginPath(); g.moveTo(L, yy); g.lineTo(W - R, yy); g.stroke(); g.textAlign = "right"; g.fillText(fmt(v, series), L - 8, yy + 4); }
    g.textAlign = "center"; const days = new Set();
    P.forEach((p, i) => { const d = p.t.slice(0, 10); if (!days.has(d) && p.t.slice(11, 13) === "00") { days.add(d); g.fillStyle = "#6f8a7d"; g.fillText(d.slice(5), x(i), H - 12); g.strokeStyle = "rgba(95,240,168,.12)"; g.beginPath(); g.moveTo(x(i), T); g.lineTo(x(i), H - B); g.stroke(); } });
    const gr = g.createLinearGradient(0, T, 0, H - B); gr.addColorStop(0, col + "55"); gr.addColorStop(1, col + "00");
    g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(x(i), y(p[series])) : g.moveTo(x(i), y(p[series])))); g.lineTo(x(P.length - 1), H - B); g.lineTo(x(0), H - B); g.closePath(); g.fillStyle = gr; g.fill();
    g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(x(i), y(p[series])) : g.moveTo(x(i), y(p[series])))); g.strokeStyle = col; g.lineWidth = 2.2; g.shadowColor = col; g.shadowBlur = 10; g.stroke(); g.shadowBlur = 0;
    const i = hover >= 0 ? hover : P.length - 1, p = P[i];
    g.strokeStyle = "rgba(227,235,229,.25)"; g.beginPath(); g.moveTo(x(i), T); g.lineTo(x(i), H - B); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(x(i), y(p[series]), 5, 0, 6.283); g.fill();
    tip.innerHTML = `<b style="color:${col}">${fmt(p[series], series)}${series === "burned" ? " REINPAY burned" : " holders"}</b><span>${when(p.t)} · block ${p.block.toLocaleString("en-US")}</span>`;
  }
  cv.addEventListener("pointermove", (e) => { const r = cv.getBoundingClientRect(), L = 58, R = 18; hover = Math.max(0, Math.min(P.length - 1, Math.round(((e.clientX - r.left - L) / (r.width - L - R)) * (P.length - 1)))); draw(); });
  cv.addEventListener("pointerleave", () => { hover = -1; draw(); });
  tabs.forEach((b) => b.addEventListener("click", () => { series = b.dataset.series; tabs.forEach((x) => x.classList.toggle("on", x === b)); draw(); }));
  new ResizeObserver(fit).observe(cv);
  fetch(box.dataset.src + "?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((h) => {
    if (!h || !h.points?.length) { tip.textContent = "The history is being built by the on-chain job. Check back within the hour."; return; }
    P = h.points; const a = P[0], z = P[P.length - 1];
    document.getElementById("hist-sum").textContent = `${P.length} hourly points · ${when(a.t)} to ${when(z.t)} · holders ${a.holders} → ${z.holders} · burned ${(a.burned / 1e6).toFixed(2)}M → ${(z.burned / 1e6).toFixed(2)}M`;
    fit();
  }).catch(() => { tip.textContent = "The history could not be read right now."; });
})();
