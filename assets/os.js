// reinpay.app home: Reinpay Intelligence in its network, a payment trace decided by Reinpay's own rules engine
// (the same files as the wallet, copied unchanged into assets/check), and an illustrative mission control.
import { decide, findPayee, parseAmount } from "./check/rules.js";
import { ROWS, WEATHER, GPU, USDG } from "./check/labcore.js";
if (document.getElementById("net")) {
const $ = (i) => document.getElementById(i), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
// ---------- hero: Reinpay Intelligence in the middle of its network ----------
(() => {
  const cv = $("net"), g = cv.getContext("2d");
  let W, H, dpr;
  function fit() { dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  new ResizeObserver(fit).observe(cv); fit();
  const N = [["AGENT-01", -.36, -.30, "a"], ["AGENT-02", -.40, .16, "a"], ["AGENT-03", -.16, .40, "a"], ["PAYEE LIST", .08, -.40, "r"], ["BUDGETS", .34, -.22, "r"], ["YOUR LINE", .40, .10, "r"], ["SIMULATION", .26, .38, "s"], ["RECEIPTS", -.04, .44, "s"], ["OWNER KEY", -.42, -.04, "o"], ["ROBINHOOD CHAIN", .40, -.42, "c"]];
  const SH = { head: "M210 70 L390 70 Q402 70 402 82 L402 196 Q402 208 390 208 L210 208 Q198 208 198 196 L198 82 Q198 70 210 70 Z", neck: "M282 208 L318 208 L322 236 L278 236 Z", torso: "M232 240 Q300 228 368 240 L388 300 L376 420 Q300 436 224 420 L212 300 Z", armL: "M232 244 L204 252 L170 360 L158 452 L178 456 L196 366 L224 300 Z", armR: "M368 244 L396 252 L430 360 L442 452 L422 456 L404 366 L376 300 Z" };
  const BOX = { head: [196, 68, 404, 210], neck: [276, 206, 324, 238], torso: [210, 226, 390, 438], armL: [156, 242, 236, 458], armR: [364, 242, 444, 458] };
  const t = document.createElement("canvas").getContext("2d"); let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; const dots = [];
  for (const [k, d] of Object.entries(SH)) { const p = new Path2D(d), [x0, y0, x1, y1] = BOX[k]; let m = 0, c = 0; while (m < (k === "head" ? 900 : 700) && c < 60000) { c++; const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0); if (!t.isPointInPath(p, x, y)) continue; if (k === "head" && x > 214 && x < 386 && y > 84 && y < 194) continue; let e = 0; for (const [a, b] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (!t.isPointInPath(p, x + a, y + b)) e++; if (!e && rnd() > .45) continue; dots.push({ x, y, e: e > 0, ph: rnd() * 6.28 }); m++; } }
  const pulses = Array.from({ length: 14 }, () => ({ n: Math.floor(Math.random() * N.length), t: Math.random(), sp: .004 + Math.random() * .006 }));
  const COL = { a: "#7aa7ff", r: "#5ff0a8", s: "#5ff0a8", o: "#e2b057", c: "#e2b057" };
  const LINES = ["> 4663 mainnet", "> rules sealed ok", "> waits for your yes", "> simulate first"];
  function frame(now) {
    const sec = now / 1000; g.clearRect(0, 0, W, H);
    const wide = W > 960, cx = W * (wide ? .66 : .5), cy = H * (wide ? .47 : .5), R = Math.min(W, H), SX = wide ? .5 : .9;
    g.strokeStyle = "rgba(95,240,168,.05)"; g.lineWidth = 1; for (let x = (cx % 40); x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = (cy % 40); y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let i = 0; i < 3; i++) { g.save(); g.translate(cx, cy); g.rotate(sec * .05 * (i % 2 ? 1 : -1) + i); g.strokeStyle = `rgba(95,240,168,${.16 - i * .04})`; g.beginPath(); g.ellipse(0, 0, R * (.30 + i * .1), R * (.12 + i * .05), 0, 0, 6.283); g.stroke(); g.restore(); }
    const pos = N.map(([, x, y]) => [cx + x * W * SX, cy + y * H * .95]);
    pos.forEach(([x, y], i) => { const grd = g.createLinearGradient(cx, cy, x, y); grd.addColorStop(0, "rgba(95,240,168,.45)"); grd.addColorStop(1, "rgba(122,167,255,.12)"); g.strokeStyle = grd; g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo((cx + x) / 2 + (y - cy) * .15, (cy + y) / 2 - (x - cx) * .15, x, y); g.stroke(); });
    for (const p of pulses) { if (!RM) p.t += p.sp; if (p.t > 1) { p.t = 0; p.n = Math.floor(Math.random() * N.length); } const [x, y] = pos[p.n], q = p.t, mx = (cx + x) / 2 + (y - cy) * .15, my = (cy + y) / 2 - (x - cx) * .15; const px = (1 - q) * (1 - q) * x + 2 * (1 - q) * q * mx + q * q * cx, py = (1 - q) * (1 - q) * y + 2 * (1 - q) * q * my + q * q * cy; g.fillStyle = COL[N[p.n][3]]; g.shadowColor = g.fillStyle; g.shadowBlur = 10; g.beginPath(); g.arc(px, py, 2.4, 0, 6.283); g.fill(); g.shadowBlur = 0; }
    g.font = '500 11px "IBM Plex Mono", monospace';
    N.forEach(([name, , , k], i) => { const [x, y] = pos[i], c = COL[k]; g.strokeStyle = c; g.lineWidth = 1.5; g.fillStyle = "#070b09"; if (k === "a") { g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y); g.closePath(); g.fill(); g.stroke(); } else if (k === "r" || k === "s") { g.fillRect(x - 6, y - 6, 12, 12); g.strokeRect(x - 6, y - 6, 12, 12); } else { g.beginPath(); g.arc(x, y, 6, 0, 6.283); g.fill(); g.stroke(); } g.fillStyle = "rgba(200,220,210,.75)"; g.fillText(name, x + 12, y + 4); });
    const S = Math.min(W * (wide ? .55 : 1), H) / 900, ox = cx - 300 * S, oy = cy - 260 * S, br = Math.sin(sec * 1.6) * 1.5;
    g.fillStyle = "rgba(7,11,9,.85)"; g.beginPath(); g.arc(cx, cy - 40 * S, 190 * S, 0, 6.283); g.fill();
    for (const d of dots) { const r = (d.e ? 1.1 : .8) * Math.max(.8, S * 1.2); g.fillStyle = d.e ? "rgba(200,240,220,.9)" : "rgba(170,210,190,.55)"; g.fillRect(ox + d.x * S + Math.sin(sec * 1.2 + d.ph) * .6 - r, oy + (d.y + br) * S - r, r * 2, r * 2); }
    const X = (x) => ox + x * S, Y = (y) => oy + (y + br) * S;
    g.fillStyle = "rgba(5,20,12,.95)"; g.fillRect(X(214), Y(84), 172 * S, 110 * S);
    const blink = (sec % 4) < .12, eh = (blink ? 2 : 18) * S; g.fillStyle = "#5ff0a8"; g.shadowColor = "#5ff0a8"; g.shadowBlur = 14; g.fillRect(X(262), Y(118) - eh / 2, 18 * S, eh); g.fillRect(X(320), Y(118) - eh / 2, 18 * S, eh); g.shadowBlur = 0;
    if (S > .55) { g.font = `500 ${Math.max(7, 9 * S)}px "IBM Plex Mono", monospace`; g.fillStyle = "rgba(95,240,168,.8)"; const b = Math.floor(sec / 2) % LINES.length; g.fillText(LINES[b], X(224), Y(165)); g.fillText(LINES[(b + 1) % LINES.length], X(224), Y(180)); }
    g.strokeStyle = "#5ff0a8"; g.lineWidth = 1.5; g.strokeRect(X(214), Y(84), 172 * S, 110 * S);
    g.fillStyle = "#cfe9dc"; g.font = '600 11px "IBM Plex Mono", monospace'; g.textAlign = "center"; g.fillText("REINPAY INTELLIGENCE", cx, Y(470)); g.textAlign = "left";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// ---------- payment trace: Reinpay's own rules engine, in this page ----------
(() => {
  const PAYEES = [{ name: "Weather API", address: WEATHER, isContract: false }, { name: "GPU credits", address: GPU, isContract: false }, { name: "USDG payouts", address: USDG }];
  const STEPS = [["01", "Agent asks", "request_payment arrives"], ["02", "Payee", "on the list, not expired"], ["03", "Memo", "says what it is for, no blocked word"], ["04", "Budget", "per payment, per day, counts"], ["05", "Your line", "above it, it waits for you"], ["06", "Simulation", "eth_simulateV1 on mainnet"], ["07", "Receipt", "what happened, which rule"]];
  const stepOf = (rule) => { if (!rule) return 6; if (/payee list|payee expired|payee tokens|token contract|tokens/.test(rule)) return 1; if (/memo/.test(rule)) return 2; if (/approval line|first payment|quiet hours|co-sign|unproven/.test(rule)) return 4; if (/simulation|network fee/.test(rule)) return 5; return 3; };
  const bar = $("tr-steps"); bar.innerHTML = STEPS.map(([n, t, s], i) => `<div class="ts" data-i="${i}"><div class="ts-top"><i></i><span>${n}</span><b class="ts-st">PENDING</b></div><h4>${t}</h4><small>${s}</small><em class="ts-ms">—</em></div>`).join("");
  let receipts = [], n = 120, playing = false, stepMode = false, resolveStep = null;
  const wait = (ms) => stepMode ? new Promise((r) => (resolveStep = r)) : sleep(RM ? 0 : ms);
  $("tr-step").onclick = () => { stepMode = true; if (resolveStep) { const r = resolveStep; resolveStep = null; r(); } else if (!playing) run(); };
  $("tr-run").onclick = () => { stepMode = false; if (resolveStep) { const r = resolveStep; resolveStep = null; r(); } else if (!playing) run(); };
  $("tr-reset").onclick = () => { receipts = []; $("tr-log").innerHTML = ""; reset(); $("tr-detail").innerHTML = '<p class="dim">Pick a request and press Run.</p>'; $("tr-json").textContent = "{}"; };
  document.querySelectorAll("[data-preset]").forEach((b) => b.onclick = () => { const [p, a, m] = b.dataset.preset.split("|"); $("tr-payee").value = p; $("tr-amt").value = a; $("tr-memo").value = m; });
  function reset() { bar.querySelectorAll(".ts").forEach((e) => { e.className = "ts"; e.querySelector(".ts-st").textContent = "PENDING"; e.querySelector(".ts-ms").textContent = "—"; }); }
  function set(i, cls, st, ms) { const e = bar.children[i]; e.className = "ts " + cls; e.querySelector(".ts-st").textContent = st; e.querySelector(".ts-ms").textContent = ms; }
  async function run() {
    playing = true; reset();
    const rset = $("tr-rules").value, rules = Object.fromEntries(Object.entries(ROWS[rset].rules).filter(([, v]) => v !== undefined));
    const q = { payee: $("tr-payee").value.trim(), amount: $("tr-amt").value.trim(), memo: $("tr-memo").value.trim() };
    const p = findPayee(PAYEES, q.payee), now = Date.now();
    let d;
    if (p && p.address === USDG) d = { status: "blocked", rule: "token contract", reason: "USDG payouts is a token contract: Reinpay never pays a token contract directly." };
    else { let amountRaw; try { amountRaw = parseAmount(q.amount, "ETH"); } catch (e) { d = { status: "blocked", rule: "amount", reason: e.message }; } if (!d) { d = decide({ rules, receipts, request: { payee: p, token: "ETH", amountRaw, memo: q.memo, balanceRaw: 10n ** 18n }, now }); if (p && d.status !== "blocked") receipts.push({ id: `RP-${n}`, payeeAddress: p.address, token: "ETH", amountRaw: amountRaw.toString(), createdAt: now, status: d.status === "allowed" ? "ready" : d.status }); } }
    const stop = d.status === "allowed" ? 6 : stepOf(d.rule), id = `RP-00${++n}`; let t = 0;
    const detail = (h, list) => { $("tr-detail").innerHTML = `<div class="dim mono">FRAME ${h}</div>` + list; };
    for (let i = 0; i < STEPS.length; i++) {
      set(i, "run", "RUNNING", `T+${t}ms`); detail(`${STEPS[i][0]} / 07 · RUNNING`, `<h3>${STEPS[i][1]}</h3><p class="dim">${STEPS[i][2]}</p>`);
      await wait(550); t += [0, 2, 1, 3, 2, 640, 4][i];
      if (i === stop && d.status !== "allowed") { const held = d.status === "needs_approval"; set(i, held ? "held" : "bad", held ? "WAITS" : "BLOCKED", `T+${t}ms`); for (let j = i + 1; j < 6; j++) set(j, "skip", "SKIPPED", "—"); set(6, "ok", "DONE", `T+${t + 1}ms`); break; }
      if (i === 5) { set(i, "ok", "WOULD RUN", `T+${t}ms`); continue; }
      set(i, "ok", "DONE", `T+${t}ms`);
    }
    const out = d.status === "allowed" ? "ready" : d.status;
    const rec = { receipt: id, status: out, rule: d.rule || "within rules", reason: d.reason || "Every check passed.", payee: p ? p.name : q.payee, payeeAddress: p ? p.address : null, amount: q.amount, token: "ETH", memo: q.memo, rules: ROWS[rset].label, simulation: d.status === "allowed" ? "eth_simulateV1 on mainnet (runs in the real wallet; not run in this page)" : "not reached", signed: false };
    $("tr-json").textContent = JSON.stringify(rec, null, 2);
    const word = { ready: "WOULD PAY", needs_approval: "WAITS FOR YOU", blocked: "BLOCKED" }[out];
    detail("07 / 07 · SETTLED", `<h3>${word}</h3><p>${(d.reason || "Every check passed. In a real wallet the payment is simulated on mainnet, then sent (or waits for your yes, until autosend is on).").replace(/</g, "&lt;")}</p><p class="dim mono">rule · ${d.rule || "within rules"}</p>`);
    const row = document.createElement("div"); row.className = "lg " + (out === "ready" ? "ok" : out === "blocked" ? "bad" : "held"); row.innerHTML = `<span>${id}</span><span></span><span>${q.amount} ETH</span><b>${word}</b>`; row.children[1].textContent = (p ? p.name : q.payee).slice(0, 22); $("tr-log").prepend(row);
    playing = false;
  }
})();

// ---------- mission control (illustrative) ----------
(() => {
  const agents = [["A1", "Research-01", "pays data APIs", 25, 6.4], ["A2", "Builder-02", "pays GPU credits", 40, 18.2], ["A3", "Ops-03", "pays monitoring", 10, 2.1]];
  $("mc-agents").innerHTML = agents.map(([k, n, s, cap, sp], i) => `<button class="ag${i ? "" : " on"}" data-a="${i}"><span class="dim mono">${k}</span> <b>${n}</b><small>${s}</small></button>`).join("");
  const show = (i) => { const [, n, , cap, sp] = agents[i]; $("mc-name").textContent = n; $("mc-cap").textContent = cap.toFixed(2) + " USDG"; $("mc-spent").textContent = sp.toFixed(2); $("mc-bar").style.width = (sp / cap * 100) + "%"; document.querySelectorAll(".ag").forEach((b, j) => b.classList.toggle("on", j === i)); };
  document.querySelectorAll(".ag").forEach((b) => b.onclick = () => show(+b.dataset.a)); show(0);
  const feed = [["Research-01", "Weather API", "2.00", "SENT", "within rules"], ["Builder-02", "GPU credits", "8.00", "WAITS", "approval line"], ["Ops-03", "0x9f3c…e21a", "0.30 ETH", "BLOCKED", "payee list"], ["Research-01", "Weather API", "2.00", "BLOCKED", "repeat guard"], ["Builder-02", "GPU credits", "3.50", "SENT", "within rules"], ["Ops-03", "Status page", "1.00", "SENT", "within rules"], ["Builder-02", "GPU credits", "12.00", "BLOCKED", "max per payment"], ["Research-01", "Data feed", "0.50", "WAITS", "first payment"]];
  let k = 0, clock = 10 * 60 + 2;
  const tick = () => { const [a, p, amt, st, r] = feed[k++ % feed.length]; clock++; const row = document.createElement("div"); row.className = "mr " + (st === "SENT" ? "ok" : st === "BLOCKED" ? "bad" : "held"); row.innerHTML = `<span class="dim">${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}</span><span>${a}</span><span>${p}</span><span>${amt}</span><span class="dim">${r}</span><b>${st}</b>`; const box = $("mc-feed"); box.prepend(row); while (box.children.length > 7) box.lastChild.remove(); };
  for (let i = 0; i < 6; i++) tick(); if (!RM) setInterval(tick, 2200);
})();


// the latest numbers from the hourly chain reader
const box = document.querySelector(".os[data-src]");
if (box) fetch(box.dataset.src + "?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((D) => {
  if (!D || D.kind !== "reinpay-chain-stats") return;
  const big = (raw) => (BigInt(raw) / 10n ** BigInt(D.decimals)).toLocaleString("en-US"), set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("os-burned", big(D.burned) + " REINPAY"); set("os-supply", D.burnedPct.toFixed(2) + "% · " + D.burns.length + " burns"); set("os-holders", D.holders); set("os-block", D.block.toLocaleString("en-US"));
}).catch(() => {});
}
