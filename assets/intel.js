// reinpay.app/intelligence: a figure of dots with a terminal for a head. Its screen shows the latest numbers from
// assets/chain/stats.json (written every hour from Robinhood Chain mainnet). It only reads: no key, no signing.
(() => {
  const cv = document.getElementById("intel-canvas"); if (!cv) return;
  const ctx = cv.getContext("2d"), reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SH = {
    head: "M210 70 L390 70 Q402 70 402 82 L402 196 Q402 208 390 208 L210 208 Q198 208 198 196 L198 82 Q198 70 210 70 Z",
    neck: "M282 208 L318 208 L322 236 L278 236 Z",
    torso: "M232 240 Q300 228 368 240 L388 300 L376 420 Q300 436 224 420 L212 300 Z",
    armL: "M232 244 L204 252 L170 360 L158 452 L178 456 L196 366 L224 300 Z",
    armR: "M368 244 L396 252 L430 360 L442 452 L422 456 L404 366 L376 300 Z",
    legL: "M228 418 L298 428 L290 560 L282 690 L254 690 L250 560 Z",
    legR: "M302 428 L372 418 L350 560 L346 690 L318 690 L310 560 Z" };
  const BOX = { head: [196, 68, 404, 210], neck: [276, 206, 324, 238], torso: [210, 226, 390, 438], armL: [156, 242, 236, 458], armR: [364, 242, 444, 458], legL: [226, 416, 300, 692], legR: [300, 416, 374, 692] };
  const share = { head: .2, neck: .02, torso: .3, armL: .1, armR: .1, legL: .14, legR: .14 };
  const tmp = document.createElement("canvas").getContext("2d"); let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const dots = [], N = innerWidth < 700 ? 4200 : 7000;
  for (const [k, d] of Object.entries(SH)) { const p = new Path2D(d), [x0, y0, x1, y1] = BOX[k]; let m = 0, t = 0; while (m < N * share[k] && t < N * 80) { t++; const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0); if (!tmp.isPointInPath(p, x, y)) continue; if (k === "head" && x > 214 && x < 386 && y > 84 && y < 194 && rnd() > .06) continue; let e = 0; for (const [a, b] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (!tmp.isPointInPath(p, x + a, y + b)) e++; if (!e && rnd() > .5) continue; dots.push({ x, y, k, ph: rnd() * 6.28, sp: .4 + rnd() * .8, r: .5 + rnd() * .8, edge: e > 0 }); m++; } }
  let LINES = ["> reading 4663 mainnet", "> rules sealed: ok", "> simulate before sign", "> waiting for your yes"];
  let W = 0, H = 0, S = 1, OX = 0, OY = 0;
  function fit() { const dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); S = Math.min(W / 470, H / 690); OX = (W - 600 * S) / 2; OY = (H - 700 * S) / 2 - 10 * S; }
  new ResizeObserver(fit).observe(cv); fit();
  let T = 0; const t0 = performance.now();
  function frame(now) {
    T++; const sec = reduce ? 2 : (now - t0) / 1000; ctx.clearRect(0, 0, W, H);
    const cx = OX + 300 * S, cy = OY + 139 * S;
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(95,240,168,${.22 - i * .06})`; ctx.lineWidth = 1; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -sec * 30 * (i % 2 ? 1 : -1); ctx.beginPath(); ctx.arc(cx, cy, (130 + i * 34) * S, 0, 6.283); ctx.stroke(); } ctx.setLineDash([]);
    const breath = Math.sin(sec * 1.6) * 2, scan = (sec * 160) % 820 - 60;
    for (const d of dots) { const near = Math.abs(d.y - scan) < 16; const y = d.y + (d.k === "head" || d.k === "neck" ? breath * 1.4 : d.k.startsWith("leg") ? 0 : breath); const jx = Math.sin(T * .02 * d.sp + d.ph) * .8;
      ctx.fillStyle = near ? "rgba(95,240,168,1)" : d.edge ? "rgba(200,240,220,.85)" : "rgba(170,210,190,.55)"; const r = d.r * Math.max(.75, S) * (near ? 1.6 : 1); ctx.fillRect(OX + (d.x + jx) * S - r, OY + y * S - r, r * 2, r * 2); }
    const sx = (x) => OX + x * S, sy = (y) => OY + (y + breath * 1.4) * S;
    ctx.save(); ctx.beginPath(); ctx.rect(sx(214), sy(84), 172 * S, 110 * S); ctx.clip(); ctx.fillStyle = "rgba(5,20,12,.92)"; ctx.fillRect(sx(214), sy(84), 172 * S, 110 * S);
    const blink = (sec % 4) < .12, eh = (blink ? 2 : 18) * S; ctx.fillStyle = "#5ff0a8"; ctx.shadowColor = "#5ff0a8"; ctx.shadowBlur = 14; ctx.fillRect(sx(262), sy(118) - eh / 2, 18 * S, eh); ctx.fillRect(sx(320), sy(118) - eh / 2, 18 * S, eh); ctx.shadowBlur = 0;
    ctx.save(); ctx.beginPath(); ctx.rect(sx(214), sy(150), 172 * S, 44 * S); ctx.clip(); ctx.font = `600 ${Math.max(7, 9 * S)}px "IBM Plex Mono", monospace`; ctx.fillStyle = "rgba(95,240,168,.8)";
    const off = (sec * 14) % 14, base = Math.floor(sec) % LINES.length; for (let i = 0; i < 5; i++) ctx.fillText(LINES[(base + i) % LINES.length], sx(222), sy(162 + i * 13 - off)); ctx.restore();
    ctx.fillStyle = "rgba(95,240,168,.08)"; for (let y = 0; y < 110; y += 3) ctx.fillRect(sx(214), sy(84 + y), 172 * S, 1); ctx.restore();
    ctx.strokeStyle = "rgba(95,240,168,.9)"; ctx.lineWidth = 1.5; ctx.strokeRect(sx(214), sy(84), 172 * S, 110 * S);
    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // the latest numbers
  const box = document.getElementById("intel"), $ = (id) => document.getElementById(id);
  const big = (raw, d) => (BigInt(raw) / 10n ** BigInt(d)).toLocaleString("en-US");
  const dec = (raw, d) => (Number(BigInt(raw) / 10n ** BigInt(d - 6)) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  fetch(box.dataset.src + "?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((D) => {
    if (!D || D.kind !== "reinpay-chain-stats") return;
    const last = D.burns[0];
    $("in-burned").textContent = big(D.burned, D.decimals); $("in-holders").textContent = D.holders; $("in-block").textContent = D.block.toLocaleString("en-US");
    if (last) { $("in-last").textContent = `#${last.n} · ${dec(last.amount, D.decimals)}`; }
    $("in-at").textContent = D.at.slice(0, 16).replace("T", " ") + " UTC";
    LINES = [`> reading 4663 mainnet`, `> REINPAY burned ${big(D.burned, D.decimals)}`, `> holders ${D.holders}`, `> block ${D.block.toLocaleString("en-US")}`, last ? `> last burn #${last.n}` : "> no burns yet", `> ${D.burnedPct.toFixed(2)}% of supply burned`, "> rules sealed: ok", "> waiting for your yes"];
  }).catch(() => {});
})();
