// reinpay.app/scan: the Wallet Health Card. After Sentinel reads a wallet, this draws a card with its numbers
// (open approvals, unlimited ones, approvals to plain wallets, balances) and Reinpay Intelligence, ready to save
// as a PNG and post. Drawn in the browser; nothing is sent anywhere.
(() => {
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
  const GRADE = (d) => (d.toWallet > 0 ? ["D", "#f0836e", "High risk signals", "an unlimited or open approval to a plain wallet"] : d.unlimited > 5 ? ["C", "#e2b057", "Review your approvals", `${d.unlimited} unlimited approvals still open`] : d.unlimited > 0 ? ["B", "#c9d97a", "Mostly tidy", `${d.unlimited} unlimited approval${d.unlimited > 1 ? "s" : ""} still open`] : ["A", "#5ff0a8", "Clean", "no unlimited approvals still open"]);
  function stat(g, x, y, w, label, value, col) {
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w - 14, y); g.lineTo(x + w, y + 14); g.lineTo(x + w, y + 104); g.lineTo(x + 14, y + 104); g.lineTo(x, y + 90); g.closePath();
    g.fillStyle = "rgba(95,240,168,.05)"; g.fill(); g.strokeStyle = "rgba(95,240,168,.32)"; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = "#8aa597"; g.font = '600 13px "IBM Plex Mono", monospace'; g.fillText(label, x + 20, y + 32);
    g.fillStyle = col || "#e3ebe5"; g.font = '700 42px "Familjen Grotesk", sans-serif'; g.fillText(value, x + 20, y + 82);
  }
  window.reinpayHealthCard = async function (d) {
    const host = document.getElementById("hc"); if (!host) return;
    host.innerHTML = '<div class="hc-grid"><canvas id="hc-canvas" aria-label="Wallet Health Card"></canvas><div class="hc-side"><button class="btn" id="hc-dl" type="button">Download card (PNG)</button><div class="cmd"><pre id="hc-cap"></pre><button class="copy" type="button" data-copy>Copy caption</button></div><p class="dim" style="font-size:12.5px">The card shows what Sentinel read: approvals signed in the last ~24 hours that are still open today, and balances at the latest block.</p></div></div>';
    await document.fonts.ready;
    const cv = document.getElementById("hc-canvas"), g = cv.getContext("2d"), W = 1600, H = 900, K = 2; cv.width = W * K; cv.height = H * K; g.setTransform(K, 0, 0, K, 0, 0);
    const [gr, gcol, gword, gwhy] = GRADE(d);
    g.fillStyle = "#060908"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(95,240,168,.055)"; g.lineWidth = 1; for (let x = 0; x < W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    let rg = g.createRadialGradient(1180, 330, 0, 1180, 330, 520); rg.addColorStop(0, gcol + "26"); rg.addColorStop(1, gcol + "00"); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    figure(g, 845, 70, 1.05, ["> health card", `> grade ${gr}`, "> read only"]);
    // grade badge on the figure's chest
    g.fillStyle = "#060908"; g.beginPath(); g.arc(1160, 470, 74, 0, 6.283); g.fill(); g.strokeStyle = gcol; g.lineWidth = 5; g.shadowColor = gcol; g.shadowBlur = 24; g.stroke(); g.shadowBlur = 0;
    g.fillStyle = gcol; g.font = '700 88px "Familjen Grotesk", sans-serif'; g.textAlign = "center"; g.fillText(gr, 1160, 500); g.textAlign = "left";
    g.fillStyle = "#e2b057"; g.font = '500 16px "IBM Plex Mono", monospace'; g.fillText("REINPAY · WALLET HEALTH CARD", 80, 90);
    g.fillStyle = "#e3ebe5"; g.font = '700 68px "Familjen Grotesk", sans-serif'; g.fillText(d.addr.slice(0, 6) + "…" + d.addr.slice(-4), 80, 170);
    g.fillStyle = gcol; g.font = '700 46px "Familjen Grotesk", sans-serif'; g.fillText(gword + ".", 80, 236);
    g.fillStyle = "#c9d6ce"; g.font = '500 18px "IBM Plex Mono", monospace'; wrap(g, "Grade " + gr + ": " + gwhy + ".", 80, 276, 680, 26);
    stat(g, 80, 330, 320, "OPEN APPROVALS", d.open.toLocaleString("en-US"));
    stat(g, 420, 330, 320, "UNLIMITED", d.unlimited.toLocaleString("en-US"), d.unlimited ? "#e2b057" : "#5ff0a8");
    stat(g, 80, 454, 320, "TO PLAIN WALLETS", d.toWallet.toLocaleString("en-US"), d.toWallet ? "#f0836e" : "#5ff0a8");
    stat(g, 420, 454, 320, "TOKENS HELD", d.tokens.toLocaleString("en-US"));
    g.fillStyle = "#8aa597"; g.font = '500 16px "IBM Plex Mono", monospace';
    g.fillText(`ETH ${d.eth}   ·   USDG ${d.usdg}   ·   REINPAY ${d.reinpay}`, 80, 610);
    g.fillStyle = "#5d7568"; g.font = '500 14px "IBM Plex Mono", monospace';
    wrap(g, `Approvals signed in the last ~24 hours that are still open, read from Robinhood Chain mainnet at block ${d.block.toLocaleString("en-US")} · ${d.at}. Signals, not advice.`, 80, 660, 700, 22);
    g.fillStyle = "#1f4a3a"; g.fillRect(80, 790, 48, 48); g.fillStyle = "#f2f6f1"; g.font = '700 28px "Familjen Grotesk", sans-serif'; g.textAlign = "center"; g.fillText("R", 104, 824); g.textAlign = "left";
    g.fillStyle = "#e3ebe5"; g.font = '700 30px "Familjen Grotesk", sans-serif'; g.fillText("Reinpay", 144, 824);
    g.fillStyle = "#5ff0a8"; g.font = '600 22px "IBM Plex Mono", monospace'; g.textAlign = "right"; g.fillText("reinpay.app/scan", 1520, 824); g.textAlign = "left";
    const cap = gr === "A" ? `My wallet on Reinpay: grade A ✓\n\nNo unlimited approvals still open, checked by Reinpay Sentinel on Robinhood Chain mainnet.\n\nCheck yours: reinpay.app/scan` : `My wallet on Reinpay: grade ${gr}\n\n${d.open} open approvals, ${d.unlimited} unlimited, ${d.toWallet} to plain wallets. Time to clean up.\n\nCheck yours with Reinpay Sentinel: reinpay.app/scan`;
    document.getElementById("hc-cap").textContent = cap;
    document.getElementById("hc-dl").onclick = () => { const a = document.createElement("a"); a.download = `reinpay-health-${d.addr.slice(2, 8)}.png`; a.href = cv.toDataURL("image/png"); a.click(); };
  };
})();
