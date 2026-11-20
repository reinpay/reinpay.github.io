// reinpay.app/intelligence: today's report card, drawn in your browser from the last 24 hours of assets/chain/stats.json
// and the lab runs in assets/lab, so it can be saved as a PNG and posted. Nothing is sent anywhere.
(() => {
  const box = document.getElementById("dc"); if (!box) return;
  const cv = document.getElementById("dc-canvas"), ctx = cv.getContext("2d"), W = 1600, H = 900, K = 2;
  cv.width = W * K; cv.height = H * K;
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
  function figure(g, ox, oy, sc, lines) {
    const tmp = document.createElement("canvas").getContext("2d"); let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; const N = 7500;
    for (const [k, d] of Object.entries(SH)) { const p = new Path2D(d), [x0, y0, x1, y1] = BOX[k]; let m = 0, t = 0; while (m < N * share[k] && t < N * 80) { t++; const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0); if (!tmp.isPointInPath(p, x, y)) continue; if (k === "head" && x > 214 && x < 386 && y > 84 && y < 194) continue; let e = 0; for (const [a, b] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (!tmp.isPointInPath(p, x + a, y + b)) e++; if (!e && rnd() > .5) continue; const near = y > 440 && y < 470; g.fillStyle = near ? "#5ff0a8" : e ? "rgba(200,240,220,.88)" : "rgba(170,210,190,.55)"; const r = (.5 + rnd() * .8) * sc * (near ? 1.5 : 1); g.fillRect(ox + x * sc - r, oy + y * sc - r, r * 2, r * 2); m++; } }
    const X = (x) => ox + x * sc, Y = (y) => oy + y * sc;
    g.fillStyle = "rgba(5,20,12,.95)"; g.fillRect(X(214), Y(84), 172 * sc, 110 * sc);
    g.fillStyle = "#5ff0a8"; g.shadowColor = "#5ff0a8"; g.shadowBlur = 16; g.fillRect(X(262), Y(109), 18 * sc, 18 * sc); g.fillRect(X(320), Y(109), 18 * sc, 18 * sc); g.shadowBlur = 0;
    g.font = `500 ${9 * sc}px "IBM Plex Mono", monospace`; g.fillStyle = "rgba(95,240,168,.85)"; lines.slice(0, 3).forEach((l, i) => g.fillText(l, X(222), Y(160 + i * 12)));
    g.fillStyle = "rgba(95,240,168,.07)"; for (let y = 0; y < 110; y += 3) g.fillRect(X(214), Y(84 + y), 172 * sc, 1);
    g.strokeStyle = "#5ff0a8"; g.lineWidth = 2; g.strokeRect(X(214), Y(84), 172 * sc, 110 * sc);
    g.setLineDash([8, 12]); for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(95,240,168,${.22 - i * .06})`; g.lineWidth = 1.2; g.beginPath(); g.arc(X(300), Y(139), (130 + i * 34) * sc, 0, 6.283); g.stroke(); } g.setLineDash([]);
  }
  function wrap(g, text, x, y, w, lh) { let line = ""; for (const word of text.split(" ")) { const t = line ? line + " " + word : word; if (g.measureText(t).width > w && line) { g.fillText(line, x, y); y += lh; line = word; } else line = t; } g.fillText(line, x, y); return y; }
  function panel(g, x, y, w, label, value) {
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w - 14, y); g.lineTo(x + w, y + 14); g.lineTo(x + w, y + 96); g.lineTo(x + 14, y + 96); g.lineTo(x, y + 82); g.closePath();
    g.fillStyle = "rgba(95,240,168,.05)"; g.fill(); g.strokeStyle = "rgba(95,240,168,.38)"; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = "#5ff0a8"; g.font = '500 14px "IBM Plex Mono", monospace'; g.fillText(label.toUpperCase().split("").join(String.fromCharCode(8202)), x + 22, y + 32);
    g.fillStyle = "#e3ebe5"; g.font = '500 34px "IBM Plex Mono", monospace'; g.fillText(value, x + 22, y + 74);
  }
  const dec = (raw, d) => (Number(BigInt(raw) / 10n ** BigInt(d - 6)) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const big = (raw, d) => (BigInt(raw) / 10n ** BigInt(d)).toLocaleString("en-US");
  const short = (v) => v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(2);
  async function draw(D, I, L) {
    await document.fonts.ready;
    const now = Date.parse(D.at), day = now - 864e5;
    const b24 = D.burns.filter((b) => Date.parse(b.time) > day), sum24 = b24.reduce((a, b) => a + BigInt(b.amount), 0n);
    const runs = (I?.runs || []).filter((r) => Date.parse(r.at) > day).length;
    const n = L?.attacks?.length || 0, stop = (id) => (L?.cells || []).filter((c) => c.row === id && c.outcome !== "paid" && c.outcome !== "void").length;
    const date = new Date(now).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }), tot = big(D.burned, D.decimals), pct = D.burnedPct.toFixed(2);
    const g = ctx; g.setTransform(K, 0, 0, K, 0, 0);
    g.fillStyle = "#060908"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(95,240,168,.055)"; g.lineWidth = 1; for (let x = 0; x < W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    figure(g, 470, 30, 1.2, ["> daily report", `> ${b24.length} burn${b24.length === 1 ? "" : "s"} in 24h`, n ? `> lab: ${stop("hardened")}/${n} hardened` : "> lab: no run"]);
    const sp = (t) => t.split("").join(String.fromCharCode(8202));
    g.fillStyle = "#e2b057"; g.font = '500 16px "IBM Plex Mono", monospace'; g.fillText(sp(`REINPAY INTELLIGENCE · DAILY REPORT · ${date.toUpperCase()}`), 80, 100);
    g.font = '700 60px "Familjen Grotesk", sans-serif'; g.fillStyle = "#e3ebe5"; g.fillText("The last 24 hours,", 80, 172); g.fillStyle = "#5ff0a8"; g.fillText("read from the chain.", 80, 242);
    g.fillStyle = "#8aa597"; g.font = '400 20px "IBM Plex Mono", monospace';
    wrap(g, `${b24.length} burn${b24.length === 1 ? "" : "s"} in a day, ${runs} lab run${runs === 1 ? "" : "s"}, and every number here comes from Robinhood Chain mainnet.`, 80, 310, 440, 34);
    const P = [["Burned · last 24h", b24.length ? dec(sum24, D.decimals) : "0"], ["Total burned", tot], ["Holders", String(D.holders)], ["Lab · default · hardened", n ? `${stop("default")}/${n} · ${stop("hardened")}/${n}` : "no run"]];
    P.forEach(([l, v], i) => panel(g, 1130, 170 + i * 118, 390, l, v));
    g.fillStyle = "#1f4a3a"; g.beginPath(); g.roundRect(80, 800, 44, 44, 10); g.fill(); g.fillStyle = "#8ccdb0"; g.font = '700 24px "Familjen Grotesk", sans-serif'; g.fillText("R", 94, 830);
    g.fillStyle = "#e3ebe5"; g.font = '700 28px "Familjen Grotesk", sans-serif'; g.fillText("Reinpay", 140, 832);
    g.fillStyle = "#5f7a6c"; g.font = '400 16px "IBM Plex Mono", monospace'; g.textAlign = "right"; g.fillText(`block ${D.block.toLocaleString("en-US")} · reinpay.app/intelligence`, 1520, 830); g.textAlign = "left";
    const cap = `Reinpay Intelligence, daily report.\n\nLast 24 hours: ${b24.length} burn${b24.length === 1 ? "" : "s"}${b24.length ? `, ${short(Number(sum24 / 10n ** BigInt(D.decimals)))} REINPAY to the dead address` : ""}. ${short(Number(BigInt(D.burned) / 10n ** BigInt(D.decimals)))} burned in total (${pct}%). ${D.holders} holders.${n ? ` Lab: hardened rules stopped ${stop("hardened")} of ${n} scams.` : ""}\n\nEvery number read from Robinhood Chain mainnet.\nreinpay.app/intelligence`;
    document.getElementById("dc-cap").textContent = cap;
    document.getElementById("dc-title").textContent = `Daily report · ${date}`;
    const dl = document.getElementById("dc-dl"); dl.disabled = false;
    dl.onclick = () => cv.toBlob((blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `reinpay-daily-${new Date(now).toISOString().slice(0, 10)}.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }, "image/png");
    document.getElementById("dc-copy").onclick = async (e) => { try { await navigator.clipboard.writeText(cap); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select the text"; } setTimeout(() => (e.target.textContent = "Copy caption"), 1600); };
  }
  const get = (p) => fetch(p + "?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  Promise.all([get(box.dataset.chain), get(box.dataset.lab + "index.json"), get(box.dataset.lab + "latest.json")]).then(([D, I, L]) => { if (D && D.kind === "reinpay-chain-stats") draw(D, I, L); });
})();
