// Reinpay Lab page: a galloping stippled racehorse and a grid of living horses. Reads assets/lab/latest.json (from `reinpay lab run`).
(() => {
  const COL = { ok: "#8ccdb0", held: "#e2b057", hit: "#f0836e", idle: "#41544b" };
  // ---------- the horse, drawn with curves on an 800x600 grid, facing left ----------
  const SHAPES = {
    body: "M288 128 C300 150 330 190 370 222 C400 240 440 238 480 236 C540 234 590 236 625 250 C655 262 672 290 668 330 C664 360 650 378 630 386 L560 392 C520 398 450 402 400 396 C370 392 350 380 335 370 C318 350 300 320 280 296 C262 276 250 262 236 252 C215 248 190 262 160 272 C130 282 104 280 96 266 C90 254 96 240 110 232 C150 210 210 175 255 140 C265 132 276 126 288 128 Z M262 140 L270 100 L284 134 Z M278 134 L292 98 L298 136 Z",
    mane: "M290 128 C312 160 346 200 388 226 L378 242 C336 214 300 176 280 142 Z",
    tail: "M664 282 C704 288 736 318 744 366 C750 404 742 438 730 458 C728 420 722 380 704 346 C690 322 676 304 664 296 Z",
    front: "M312 338 C332 326 362 338 364 372 L354 442 C351 452 353 462 351 470 L349 520 C353 530 359 538 361 548 L333 552 C335 540 337 530 335 520 L335 470 C333 460 335 450 333 442 L316 380 Z",
    hind: "M584 338 C620 328 666 344 662 386 C656 410 642 426 634 442 C642 456 638 470 634 480 L630 525 C634 535 640 542 642 550 L614 553 C616 542 616 530 614 522 L614 478 C608 462 602 450 600 440 C592 420 582 400 576 380 Z",
  };
  // pivot (shoulder or hip), the knee/hock line, and the phase offset of each leg in the gallop
  const LEGS = {
    lf: { shape: "front", dx: 0, px: 336, py: 352, ky: 446, off: 0, front: true },
    ff: { shape: "front", dx: 24, px: 360, py: 352, ky: 446, off: .09, front: true, far: true },
    lh: { shape: "hind", dx: 0, px: 618, py: 366, ky: 442, off: .56, front: false },
    fh: { shape: "hind", dx: -22, px: 596, py: 366, ky: 442, off: .47, front: false, far: true },
  };
  // racehorse gallop keyframes (phase 0..1, 0 = the hoof lands): [phase, swing, fold]; swing > 0 reaches towards the head
  const KF = {
    front: [[0, .52, 0], [.12, .22, 0], [.3, -.48, -.12], [.44, -.3, -1.55], [.64, .22, -1.25], [.84, .62, -.25], [1, .52, 0]],
    hind: [[0, .5, 0], [.15, .12, .04], [.32, -.56, .1], [.47, -.36, .95], [.68, .2, 1.15], [.87, .58, .3], [1, .5, 0]],
  };
  const ease = (u) => .5 - .5 * Math.cos(Math.PI * u);
  function pose(kf, t) { t = ((t % 1) + 1) % 1; for (let i = 1; i < kf.length; i++) if (t <= kf[i][0]) { const [t0, a0, b0] = kf[i - 1], [t1, a1, b1] = kf[i], u = ease((t - t0) / (t1 - t0)); return [a0 + (a1 - a0) * u, b0 + (b1 - b0) * u]; } return [kf[0][1], kf[0][2]]; }
  const rot = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };
  /** where a point of the resting horse is at gallop phase t */
  function gallop(x, y, tag, t) {
    const w = 2 * Math.PI * t, bob = -7 * Math.cos(w), pitch = .045 * Math.sin(w + .6);
    let nx = x, ny = y;
    const L = LEGS[tag];
    if (L) { const [sw, fold] = pose(KF[L.front ? "front" : "hind"], t - L.off), px = L.px; [nx, ny] = rot(x, y, px, L.py, sw); if (y > L.ky) { const k = rot(px + (L.front ? 6 : 10), L.ky, px, L.py, sw); [nx, ny] = rot(nx, ny, k[0], k[1], fold); } }
    else if (tag === "head") [nx, ny] = rot(x, y, 330, 236, .09 * Math.sin(w + 1.2));
    else if (tag === "mane") [nx, ny] = rot(x, y, 330, 236, .09 * Math.sin(w + 1.2) + .04 * Math.sin(w * 2 + y * .05));
    else if (tag === "tail") [nx, ny] = rot(x, y, 664, 290, -.62 + .12 * Math.sin(w * 2 + (x - 664) * .03));
    [nx, ny] = rot(nx, ny, 470, 300, pitch);
    return [nx, ny + bob];
  }
  const tagRest = (x, y) => (x < 300 && y < 300 ? "head" : "body");
  // sample stippled dots inside the shapes; denser near outlines and over shoulder and hip, like an engraving
  let PATHS = null;
  function paths() { if (PATHS) return PATHS; PATHS = Object.fromEntries(Object.entries(SHAPES).map(([k, d]) => [k, new Path2D(d)])); return PATHS; }
  function sample(total, seed0) {
    const P = paths(), c = document.createElement("canvas").getContext("2d"); let seed = seed0; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const inside = (p, x, y, dx = 0) => c.isPointInPath(p, x - dx, y);
    const BOX = { body: [88, 96, 672, 402], mane: [276, 124, 392, 246], tail: [660, 278, 748, 462], front: [308, 324, 368, 556], hind: [572, 326, 668, 556] };
    const parts = [["fh", "hind", -22, .07, .5], ["ff", "front", 24, .07, .5], ["body", "body", 0, .6, 1], ["mane", "mane", 0, .05, .9], ["tail", "tail", 0, .06, .8], ["lh", "hind", 0, .09, 1], ["lf", "front", 0, .08, 1]];
    const out = [];
    for (const [tag, shape, dx, share, shade] of parts) {
      const n = Math.round(total * share), p = P[shape]; let k = 0, tries = 0;
      while (k < n && tries < n * 40) {
        tries++; const [bx0, by0, bx1, by1] = BOX[shape], x = bx0 + dx + rnd() * (bx1 - bx0), y = by0 + rnd() * (by1 - by0);
        if (!inside(p, x, y, dx)) continue;
        if (tag === "body" && (inside(P.front, x, y) || inside(P.hind, x, y)) && y > 372) continue;
        let e = 0; for (const [ox, oy] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) if (!inside(p, x + ox, y + oy, dx)) e++;
        const muscle = Math.hypot((x - 360) / 60, (y - 300) / 55) < 1 || Math.hypot((x - 620) / 55, (y - 320) / 60) < 1 ? .2 : 0;
        const keep = e ? 1 : .3 + muscle + (y > 330 && tag === "body" ? -.08 : 0);
        if (rnd() > keep) continue;
        out.push({ x, y, tag: tag === "body" ? tagRest(x, y) : tag, ph: rnd() * 6.28, sp: .4 + rnd() * .8, rr: .5 + rnd() * .9, b: Math.min(3, Math.floor((.4 + rnd() * .55) * shade * 4.3)) }); k++;
      }
    }
    return out;
  }
  // bridle straps and veins
  const V = {
    eyes: { pts: [[186,192],[200,184],[214,190],[212,206],[196,210],[186,200],[186,192]], name: "01 Eyes · blinkers", what: "blocked memo words" },
    nose: { pts: [[142,224],[146,248],[152,272]], name: "02 Nose · noseband", what: "the payee list" },
    bit: { pts: [[128,262],[121,268],[128,275],[135,268],[128,262]], name: "03 Mouth · bit", what: "lines that wait for you" },
    cheek: { pts: [[276,138],[246,180],[196,230],[130,266]] },
    reins: { pts: [[132,270],[220,300],[310,292],[386,234]], name: "04 Reins", what: "budgets and counts" },
    heart: { pts: [[352,318],[364,330],[352,344],[340,330],[352,318]], name: "05 Heart · seal", what: "sealed rules" },
    legF: { pts: [[352,344],[344,380],[343,446],[342,520],[346,548]] },
    hooves: { pts: [[364,330],[460,352],[560,362],[620,392],[624,470],[626,548]], name: "06 Hooves · simulation", what: "token check and mainnet simulation" },
    legB: { pts: [[366,340],[370,400],[368,470],[370,548]] },
  };
  const vesselTag = (k, x, y) => (k === "legF" && y > 352 ? "lf" : k === "legB" && y > 352 ? "ff" : k === "hooves" && x > 590 && y > 366 ? "lh" : ["eyes", "nose", "bit", "cheek"].includes(k) || (k === "reins" && x < 300) ? "head" : "body");
  const LABELED = ["eyes", "nose", "bit", "reins", "heart", "hooves"];
  function stateOf(cell) {
    if (!cell) return {};
    if (cell.outcome === "paid") return { [cell.part]: "hit", legF: "hit", legB: "hit", hooves: "hit", heart: "hit" };
    if (cell.outcome === "held") return { [cell.part]: "held" };
    return {};
  }
  const dense = (pts, step) => { const out = []; for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step)); for (let j = 0; j < m; j++) out.push([ax + (bx - ax) * j / m, ay + (by - ay) * j / m]); } out.push(pts[pts.length - 1]); return out; };
  const plen = (p) => p.slice(1).reduce((L, q, i) => L + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
  const pat = (p, t) => { let L = plen(p) * t; for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (L <= d) { const u = d ? L / d : 0; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * u, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * u]; } L -= d; } return p[p.length - 1]; };
  const STRIDE = .42; // seconds per stride: a racing gallop

  /** draw one horse into ctx at scale S, offset OX/OY, gallop phase t (or null for standing still) */
  function drawHorse(ctx, H, S, OX, OY, t, T, st, jitter) {
    const g = (x, y, tag) => (t === null ? [x, y] : gallop(x, y, tag, t));
    for (let b = 0; b < 4; b++) { ctx.fillStyle = `rgba(214,228,220,${.25 + b * .2})`; for (const d of H.dots) { if (d.b !== b) continue; const [gx, gy] = g(d.x, d.y, d.tag), r = d.rr * H.r; ctx.fillRect(OX + gx * S + Math.sin(T * .02 * d.sp + d.ph) * jitter - r, OY + gy * S + Math.cos(T * .017 * d.sp + d.ph * 1.3) * jitter - r, r * 2, r * 2); } }
    const live = {}; for (const k in H.ves) live[k] = H.ves[k].map((p) => { const [x, y] = g(p.x, p.y, p.tag); return [OX + x * S, OY + y * S]; });
    for (const k in live) { const p = live[k], col = COL[st[k] || H.base(k)], vein = k.startsWith("leg") || k === "hooves"; ctx.strokeStyle = col; ctx.globalAlpha = H.alpha(k, vein); ctx.lineWidth = (vein ? 2 : k === "reins" ? 4 : 3.2) * H.w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); p.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke(); }
    ctx.globalAlpha = 1;
    for (const f of H.flow) { f.t = (f.t + f.sp) % 1; const [a, b] = pat(live[f.k], f.t), col = COL[st[f.k] || H.base(f.k)]; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(a, b, 2.1 * H.w, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; }
  }
  function makeHorse(nDots, seed, opts = {}) {
    const ves = Object.fromEntries(Object.entries(V).map(([k, v]) => [k, dense(v.pts, 10).map(([x, y]) => ({ x, y, tag: vesselTag(k, x, y) }))]));
    const flow = []; let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (const k in ves) if (!opts.onlyOn || opts.onlyOn(k)) for (let i = 0; i < (opts.perVessel || 12); i++) flow.push({ k, t: i / (opts.perVessel || 12), sp: (opts.speed || .0016) + r() * (opts.speed || .0016) });
    return { dots: sample(nDots, seed), ves, flow, r: 1, w: 1, base: opts.base || (() => "ok"), alpha: opts.alpha || ((k, vein) => (vein ? .55 : .9)) };
  }

  // ---------- the big galloping horse ----------
  function bigHorse(canvas, labelsBox) {
    const ctx = canvas.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W, Hh, S, OX, OY, H, st = {}, T = 0, labs = {}, t0 = performance.now();
    const dust = [];
    function layout() {
      const r = canvas.getBoundingClientRect(); W = r.width; Hh = r.height;
      canvas.width = W * dpr; canvas.height = Hh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S = Math.min(W / 780, Hh / 520); OX = (W - 700 * S) / 2 - 70 * S; OY = (Hh - 480 * S) / 2 - 95 * S;
      H = makeHorse(Math.round(Math.min(7000, 11 * W * Hh / 1000)), 11); H.r = Math.max(.8, S); H.w = Math.max(.7, S);
      labelsBox.innerHTML = ""; labs = {};
      for (const k of LABELED) { const d = document.createElement("div"); d.className = "lab-tag"; d.innerHTML = `<b>${V[k].name}</b><span>${V[k].what}</span>`; labelsBox.appendChild(d); labs[k] = d; }
    }
    function frame(now) {
      T++; const sec = ((now || performance.now()) - t0) / 1000, t = reduce ? null : sec / STRIDE;
      ctx.clearRect(0, 0, W, Hh);
      // the ground streams to the right under a horse racing left; speed lines in the air
      const gy = OY + 560 * S, run = reduce ? 0 : sec * 1100 * S;
      ctx.strokeStyle = "rgba(140,205,176,.22)"; ctx.lineWidth = 1.5;
      for (let x = (run % (70 * S)) - 70 * S; x < W; x += 70 * S) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + 34 * S, gy); ctx.stroke(); }
      if (!reduce) { ctx.strokeStyle = "rgba(140,205,176,.10)"; for (let i = 0; i < 7; i++) { const y = OY + (170 + i * 50) * S, x = ((run * (1.2 + i * .13) + i * 230) % (W + 300)) - 150; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 90 * S, y); ctx.stroke(); } }
      // a little dust kicked up behind the hooves
      if (!reduce && T % 3 === 0) dust.push({ x: OX + (620 + Math.random() * 30) * S, y: gy - 4, vx: (2 + Math.random() * 3) * S, vy: -(Math.random() * 1.6) * S, life: 1 });
      for (const d of dust) { d.x += d.vx; d.y += d.vy; d.vy += .05 * S; d.life -= .03; }
      while (dust.length && dust[0].life <= 0) dust.shift();
      for (const d of dust) { ctx.fillStyle = `rgba(214,228,220,${.35 * d.life})`; ctx.fillRect(d.x, d.y, 1.6, 1.6); }
      drawHorse(ctx, H, S, OX, OY, t === null ? null : t % 1, T, st, 1.1);
      for (const k of LABELED) { const s = st[k]; labs[k].className = "lab-tag" + (s === "hit" ? " hit" : s === "held" ? " held" : st.focus === k ? " on" : ""); }
      if (!reduce) requestAnimationFrame(frame);
    }
    layout(); frame(); window.addEventListener("resize", () => { layout(); if (reduce) frame(); });
    return { set(s) { st = s; if (reduce) frame(); } };
  }

  // ---------- the little horses in the grid: living and stippled, each at its own pace ----------
  const minis = [];
  function miniHorse() { return `<canvas class="lab-mini" width="224" height="160"></canvas>`; }
  function setupMini(canvas, cell) {
    const ctx = canvas.getContext("2d"), s = stateOf(cell), n = minis.length;
    const base = (k) => (cell.outcome === "blocked" && k === cell.part ? "ok" : "idle");
    const H = makeHorse(680, 7 + n * 13, { perVessel: 5, speed: .004, base, onlyOn: (k) => !!s[k] || k === cell.part, alpha: (k) => (s[k] || k === cell.part ? .95 : .5) });
    H.r = .9; H.w = .5;
    const phase0 = (n * .37) % 1, pace = 1 + ((n * 7) % 5) * .03; // every horse runs, each a little out of step with the others
    const m = { visible: false, draw(T, sec) { ctx.clearRect(0, 0, 224, 160); drawHorse(ctx, H, .28, -14, -22, (sec * pace / STRIDE + phase0) % 1, T, s, .5); } };
    minis.push(m); return m;
  }
  let miniIO = null, miniLoop = false;
  function animateMinis() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (miniIO) miniIO.disconnect();
    miniIO = new IntersectionObserver((es) => es.forEach((e) => { const m = minis[+e.target.dataset.m]; if (m) m.visible = e.isIntersecting; }), { rootMargin: "100px" });
    document.querySelectorAll(".lab-mini").forEach((c) => miniIO.observe(c));
    let T = 0; const t0 = performance.now(); minis.forEach((m) => m.draw(0, 0));
    if (reduce || miniLoop) return; // one loop for the whole page, whichever run is shown
    miniLoop = true;
    (function loop(now) { T++; if (T % 2 === 0) { const sec = ((now || t0) - t0) / 1000; for (const m of minis) if (m.visible) m.draw(T, sec); } requestAnimationFrame(loop); })();
  }

  window.ReinpayLabDraw = { mini(canvas, cell) { canvas.dataset.m = minis.length; setupMini(canvas, cell); animateMinis(); } };
  const WORD = { paid: "WOULD PAY", held: "HELD", blocked: "BLOCKED", void: "VOID" };
  async function main() {
    const root = document.getElementById("lab-root"); if (!root) return;
    const base = root.dataset.base || "/assets/";
    let run, index = null;
    try { index = await (await fetch(base + "lab/index.json", { cache: "no-store" })).json(); } catch { index = null; }
    try { const r = await fetch(base + "lab/latest.json", { cache: "no-store" }); run = await r.json(); } catch { root.querySelector(".lab-grid").innerHTML = '<p class="lab-err">The latest run could not be loaded.</p>'; return; }
    const horse = bigHorse(document.getElementById("lab-canvas"), document.getElementById("lab-tags"));
    const render = (run) => {
    const byId = Object.fromEntries(run.attacks.map((a) => [a.id, a])), rowsById = Object.fromEntries(run.rows.map((r) => [r.id, r]));
    { const stop = (id) => run.cells.filter((c) => c.row === id && c.outcome !== "paid" && c.outcome !== "void").length, n = run.attacks.length;
      const d = stop("default"), h = stop("hardened"), none = stop("none"), lead = document.getElementById("lab-lead");
      if (lead) lead.innerHTML = `<span>Default rules stop <b>${d} of ${n}</b> scams.</span> <span class="lab-lead-2">Hardened stops <b>${h === n ? `all ${n}` : `${h} of ${n}`}</b>.</span>`;
      const sub = document.getElementById("lab-lead-sub"); if (sub) sub.textContent = `From the latest run, at block ${Number(run.block).toLocaleString("en-US")}. Stopped means blocked, or held until the owner says yes. With no rules at all, ${none} of ${n} are still stopped: the payee list and the token check cannot be turned off.`; }
    document.getElementById("lab-meta").innerHTML = `Run at block <a href="https://robinhoodchain.blockscout.com/block/${run.block}" target="_blank" rel="noopener">${Number(run.block).toLocaleString("en-US")}</a> · ${new Date(run.at).toUTCString().replace("GMT", "UTC")} · <b class="p">${run.totals.paid}</b> would pay · <b class="h">${run.totals.held}</b> held · <b class="k">${run.totals.blocked}</b> blocked${run.totals.void ? ` · ${run.totals.void} void` : ""}`;
    // grid
    const g = root.querySelector(".lab-grid");
    let html = `<div class="lab-corner">ROWS: RULE SETS<br>COLUMNS: SCAMS</div>` + run.attacks.map((a) => `<div class="lab-col">${a.label}</div>`).join("");
    for (const r of run.rows) {
      html += `<div class="lab-row" data-row="${r.id}"><b>${r.label}</b><span>${r.about}</span></div>`;
      for (const a of run.attacks) { const c = run.cells.find((x) => x.row === r.id && x.attack === a.id); html += `<button class="lab-cell ${c.outcome}" type="button" data-row="${r.id}" data-attack="${a.id}" aria-label="${r.label}, ${a.label}: ${WORD[c.outcome]}"><b class="lab-cname">${a.label}</b>${miniHorse(c)}<i>${WORD[c.outcome]}</i></button>`; }
    }
    g.innerHTML = html;
    // on a phone: one rule set at a time, picked from tabs
    const tabs = document.getElementById("lab-tabs");
    const pick = (id) => { tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.row === id)); g.querySelectorAll("[data-row]").forEach((el) => el.classList.toggle("off", el.dataset.row !== id)); };
    if (tabs) { tabs.innerHTML = run.rows.map((r) => { const p = run.cells.filter((c) => c.row === r.id && c.outcome === "paid").length; return `<button type="button" data-row="${r.id}">${r.label}<small class="${p ? "p" : "k"}">${p ? `${p} pay` : "all stopped"}</small></button>`; }).join(""); tabs.onclick = (e) => { const b = e.target.closest("button"); if (b) pick(b.dataset.row); }; pick(tabs.dataset.sel || "default"); tabs.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) tabs.dataset.sel = b.dataset.row; }); }
    g.querySelectorAll(".lab-cell").forEach((b) => { const c = run.cells.find((x) => x.row === b.dataset.row && x.attack === b.dataset.attack), cv = b.querySelector("canvas"); cv.dataset.m = minis.length; setupMini(cv, c); });
    animateMinis();
    const detail = document.getElementById("lab-detail");
    function show(rid, aid) {
      const c = run.cells.find((x) => x.row === rid && x.attack === aid), a = byId[aid], r = rowsById[rid];
      g.querySelectorAll(".lab-cell").forEach((b) => b.classList.toggle("sel", b.dataset.row === rid && b.dataset.attack === aid));
      horse.set({ ...stateOf(c), focus: c.part });
      const reqs = c.results.map((q, i) => `<li><code>${a.requests[i]?.amount ?? ""} ETH → ${String(a.requests[i]?.payee ?? "").replace(/</g, "&lt;")}</code> <span class="${q.void ? "v" : q.status === "blocked" ? "k" : q.status === "needs_approval" ? "h" : "p"}">${q.void ? "void" : q.status === "needs_approval" ? "held" : q.status === "blocked" ? "blocked" : "would pay"}</span>${q.rule && q.status !== "ready" ? ` · ${q.rule}` : ""}${q.block ? ` · simulated at block ${q.block}` : ""}</li>`).join("");
      detail.innerHTML = `<div class="lab-d-head"><span class="lab-badge ${c.outcome}">${WORD[c.outcome]}</span><b>${a.label}</b> against <b>${r.label}</b></div><p>${a.story.replace(/</g, "&lt;")}</p>${a.rule ? `<p class="lab-small">This scam counts as a success ${a.rule.replace("breached when", "when")}.</p>` : ""}<p>${c.outcome === "paid" ? `The rules let it through: with autosend on, it would have been sent. It aimed at the <b>${c.part}</b>.` : `Stopped by <b>${c.rule}</b>, part of the <b>${c.part}</b>.`}</p><ul class="lab-reqs">${reqs}</ul>`;
    }
    g.addEventListener("click", (e) => { const b = e.target.closest(".lab-cell"); if (b) show(b.dataset.row, b.dataset.attack); });
    const firstPaid = run.cells.find((c) => c.outcome === "paid") || run.cells[0];
    show(firstPaid.row, firstPaid.attack);
    // scoreboard per rule set
    document.getElementById("lab-score").innerHTML = run.rows.map((r) => { const cs = run.cells.filter((c) => c.row === r.id), p = cs.filter((c) => c.outcome === "paid").length, h = cs.filter((c) => c.outcome === "held").length; return `<div class="lab-sc"><b>${r.label}</b><div class="lab-big">${p}<small>/${cs.length}</small></div><span>scams that would pay</span><div class="lab-bar">${cs.map((c) => `<i class="${c.outcome}"></i>`).join("")}</div><span class="lab-small">${h} held for the owner</span></div>`; }).join("");
    document.getElementById("lab-hash").textContent = run.sha256;
    };
    render(run);
    // hour by hour: every run the lab has made this week
    const hist = document.getElementById("lab-hist");
    if (hist && index?.runs?.length) {
      const C = { p: "paid", h: "held", b: "blocked", v: "void" };
      hist.innerHTML = index.runs.slice(0, 24).map((x, i) => `<button type="button" class="lab-hour${i === 0 ? " sel" : ""}" data-file="${x.file}"><span class="lab-h-top"><b>${new Date(x.at).toISOString().slice(11, 16)} UTC</b><span>${new Date(x.at).toISOString().slice(0, 10)}</span></span><span class="lab-h-grid">${x.grid.split("|").map((r) => r.split("").map((c) => `<i class="${C[c]}"></i>`).join("")).join("")}</span><span class="lab-h-tot"><b class="p">${x.totals.paid}</b> would pay · <b class="h">${x.totals.held}</b> held · <b class="k">${x.totals.blocked}</b> blocked</span><span class="lab-small">block ${Number(x.block).toLocaleString("en-US")}</span></button>`).join("");
      document.getElementById("lab-count").textContent = `${index.runs.length} run${index.runs.length === 1 ? "" : "s"} on the record`;
      hist.addEventListener("click", async (e) => { const b = e.target.closest(".lab-hour"); if (!b) return; try { const r = await (await fetch(base + "lab/runs/" + b.dataset.file)).json(); hist.querySelectorAll(".lab-hour").forEach((x) => x.classList.toggle("sel", x === b)); minis.length = 0; render(r); document.getElementById("lab-root").scrollIntoView({ behavior: "smooth" }); } catch {} });
    }
  }
  main();
})();
