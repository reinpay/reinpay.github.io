// Reinpay Lab page: Reinpay Intelligence (a stippled figure with a terminal for a head) and a grid of living figures. Reads assets/lab/latest.json (from `reinpay lab run`).
(() => {
  const COL = { ok: "#8ccdb0", held: "#e2b057", hit: "#f0836e", idle: "#41544b" };
  // ---------- Reinpay Intelligence: a figure with a terminal for a head, drawn on the same 800x600 grid ----------
  // Shapes are drawn on a 600x700 design grid and mapped onto the stage with M().
  const M = (x, y) => [400 + (x - 300) * .74, 100 + (y - 68) * .74];
  const SHAPES = {
    head: "M210 70 L390 70 Q402 70 402 82 L402 196 Q402 208 390 208 L210 208 Q198 208 198 196 L198 82 Q198 70 210 70 Z",
    neck: "M282 208 L318 208 L322 236 L278 236 Z",
    torso: "M232 240 Q300 228 368 240 L388 300 L376 420 Q300 436 224 420 L212 300 Z",
    armL: "M232 244 L204 252 L170 360 L158 452 L178 456 L196 366 L224 300 Z",
    armR: "M368 244 L396 252 L430 360 L442 452 L422 456 L404 366 L376 300 Z",
    legL: "M228 418 L298 428 L290 560 L282 690 L254 690 L250 560 Z",
    legR: "M302 428 L372 418 L350 560 L346 690 L318 690 L310 560 Z",
  };
  const rot = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };
  const SHL = M(228, 248), SHR = M(372, 248), NECK = M(300, 236);
  /** where a point of the resting figure is at breathing phase t (0..1) */
  function gallop(x, y, tag, t) {
    const w = 2 * Math.PI * t, breath = -2.2 * Math.sin(w);
    let nx = x, ny = y;
    if (tag === "armL") [nx, ny] = rot(x, y, SHL[0], SHL[1], .05 * Math.sin(w + .4));
    else if (tag === "armR") [nx, ny] = rot(x, y, SHR[0], SHR[1], -.05 * Math.sin(w + 1.1));
    else if (tag === "head") [nx, ny] = rot(x, y, NECK[0], NECK[1], .03 * Math.sin(w * .5));
    if (tag === "leg") return [nx, ny];
    return [nx, ny + (tag === "head" ? breath * 1.3 : breath)];
  }
  let PATHS = null;
  function paths() { if (PATHS) return PATHS; PATHS = Object.fromEntries(Object.entries(SHAPES).map(([k, d]) => [k, new Path2D(d)])); return PATHS; }
  function sample(total, seed0) {
    const P = paths(), c = document.createElement("canvas").getContext("2d"); let seed = seed0; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const BOX = { head: [196, 68, 404, 210], neck: [276, 206, 324, 238], torso: [210, 226, 390, 438], armL: [156, 242, 236, 458], armR: [364, 242, 444, 458], legL: [226, 416, 300, 692], legR: [300, 416, 374, 692] };
    const share = { head: .2, neck: .02, torso: .3, armL: .09, armR: .09, legL: .15, legR: .15 }, TAG = { head: "head", neck: "head", torso: "body", armL: "armL", armR: "armR", legL: "leg", legR: "leg" };
    const out = [];
    for (const [k, p] of Object.entries(P)) {
      const n = Math.round(total * share[k]), [x0, y0, x1, y1] = BOX[k]; let m = 0, tries = 0;
      while (m < n && tries < n * 60) {
        tries++; const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
        if (!c.isPointInPath(p, x, y)) continue;
        if (k === "head" && x > 214 && x < 386 && y > 84 && y < 194) continue; // the screen stays dark
        let e = 0; for (const [ox, oy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) if (!c.isPointInPath(p, x + ox, y + oy)) e++;
        if (!e && rnd() > .4) continue;
        const [X, Y] = M(x, y);
        out.push({ x: X, y: Y, tag: TAG[k], ph: rnd() * 6.28, sp: .4 + rnd() * .8, rr: .5 + rnd() * .9, b: e ? 3 : Math.min(3, Math.floor((.35 + rnd() * .5) * 4)) }); m++;
      }
    }
    return out;
  }
  // the parts of the agent, one per Reinpay defence (keys kept from the lab's part names)
  const mp = (a) => a.map(([x, y]) => M(x, y));
  const V = {
    eyes: { pts: mp([[252,100],[348,100],[348,140],[252,140],[252,100]]), name: "01 Eyes · screen", what: "blocked memo words" },
    nose: { pts: mp([[150,440],[186,440],[186,468],[150,468],[150,440]]), name: "02 Left hand · payee list", what: "the payee list" },
    bit: { pts: mp([[414,440],[450,440],[450,468],[414,468],[414,440]]), name: "03 Right hand · pause", what: "lines that wait for you" },
    cheek: { pts: mp([[300,194],[300,236],[300,282]]) },
    reins: { pts: mp([[222,404],[262,414],[300,418],[338,414],[378,404]]), name: "04 Belt · budgets", what: "budgets and counts" },
    heart: { pts: mp([[300,282],[318,300],[300,318],[282,300],[300,282]]), name: "05 Core · seal", what: "sealed rules" },
    legF: { pts: mp([[230,252],[198,366],[168,446]]) },
    hooves: { pts: mp([[262,690],[276,560],[296,430],[300,420],[304,430],[324,560],[338,690]]), name: "06 Feet · simulation", what: "token check and mainnet simulation" },
    legB: { pts: mp([[370,252],[402,366],[432,446]]) },
  };
  const vesselTag = (k, x, y) => (k === "eyes" || k === "cheek" && y < M(0, 236)[1] ? "head" : k === "nose" || k === "legF" ? "armL" : k === "bit" || k === "legB" ? "armR" : k === "hooves" && y > M(0, 440)[1] ? "leg" : "body");
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
  const STRIDE = 3.2; // seconds per breath

  /** draw one figure into ctx at scale S, offset OX/OY, breathing phase t (or null for still) */
  function drawHorse(ctx, H, S, OX, OY, t, T, st, jitter) {
    const g = (x, y, tag) => (t === null ? [x, y] : gallop(x, y, tag, t));
    // the screen
    const sc = [M(214, 84), M(386, 194)].map(([x, y]) => g(x, y, "head"));
    ctx.fillStyle = "rgba(5,20,12,.92)"; ctx.fillRect(OX + sc[0][0] * S, OY + sc[0][1] * S, (sc[1][0] - sc[0][0]) * S, (sc[1][1] - sc[0][1]) * S);
    for (let b = 0; b < 4; b++) { ctx.fillStyle = `rgba(214,228,220,${.25 + b * .2})`; for (const d of H.dots) { if (d.b !== b) continue; const [gx, gy] = g(d.x, d.y, d.tag), r = d.rr * H.r; ctx.fillRect(OX + gx * S + Math.sin(T * .02 * d.sp + d.ph) * jitter - r, OY + gy * S + Math.cos(T * .017 * d.sp + d.ph) * jitter - r, r * 2, r * 2); } }
    // eyes: they blink, and turn the colour of the memo-word defence
    const blink = t !== null && ((T / 60) % 4) < .1, ecol = COL[st.eyes || "ok"] === COL.idle ? "#5ff0a8" : COL[st.eyes || "ok"] === COL.ok ? "#5ff0a8" : COL[st.eyes];
    for (const ex of [262, 320]) { const [a, b] = g(...M(ex, 109), "head"), [c2, d2] = g(...M(ex + 18, 127), "head"); const h = blink ? 2 : (d2 - b) * S; ctx.fillStyle = ecol; ctx.shadowColor = ecol; ctx.shadowBlur = 10 * H.w; ctx.fillRect(OX + a * S, OY + (b + d2) / 2 * S - h / 2, (c2 - a) * S, h); ctx.shadowBlur = 0; }
    const live = {}; for (const k in H.ves) live[k] = H.ves[k].map((p) => { const [x, y] = g(p.x, p.y, p.tag); return [OX + x * S, OY + y * S]; });
    for (const k in live) { const p = live[k], col = COL[st[k] || H.base(k)], vein = k.startsWith("leg") || k === "hooves" || k === "cheek"; ctx.strokeStyle = col; ctx.globalAlpha = H.alpha(k, vein); ctx.lineWidth = (vein ? 2 : k === "reins" ? 4 : 3) * H.w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    ctx.globalAlpha = 1;
    for (const f of H.flow) { f.t = (f.t + f.sp) % 1; const [a, b] = pat(live[f.k], f.t), col = COL[st[f.k] || H.base(f.k)]; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(a, b, 2.1 * H.w, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; }
  }
  function makeHorse(nDots, seed, opts = {}) {
    const ves = Object.fromEntries(Object.entries(V).map(([k, v]) => [k, dense(v.pts, 8).map(([x, y]) => ({ x, y, tag: vesselTag(k, x, y) }))]));
    const flow = []; let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (const k in ves) if (!opts.onlyOn || opts.onlyOn(k)) for (let i = 0; i < (opts.perVessel || 8); i++) flow.push({ k, t: i / (opts.perVessel || 8), sp: (opts.speed || .0016) + r() * (opts.speed || .0016) });
    return { dots: sample(nDots, seed), ves, flow, r: 1, w: 1, base: opts.base || (() => "ok"), alpha: opts.alpha || ((k, vein) => (vein ? .55 : .9)) };
  }
  // ---------- the big figure ----------
  function bigHorse(canvas, labelsBox) {
    const ctx = canvas.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W, Hh, S, OX, OY, H, st = {}, T = 0, labs = {}, t0 = performance.now();
    const dust = [];
    function layout() {
      const r = canvas.getBoundingClientRect(); W = r.width; Hh = r.height;
      canvas.width = W * dpr; canvas.height = Hh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S = Math.min(W / 560, Hh / 500); OX = W / 2 - 400 * S; OY = Hh / 2 - 335 * S;
      H = makeHorse(Math.round(Math.min(7000, 11 * W * Hh / 1000)), 11); H.r = Math.max(.8, S); H.w = Math.max(.7, S);
      labelsBox.innerHTML = ""; labs = {};
      for (const k of LABELED) { const d = document.createElement("div"); d.className = "lab-tag"; d.innerHTML = `<b>${V[k].name}</b><span>${V[k].what}</span>`; labelsBox.appendChild(d); labs[k] = d; }
    }
    function frame(now) {
      T++; const sec = ((now || performance.now()) - t0) / 1000, t = reduce ? null : sec / STRIDE;
      ctx.clearRect(0, 0, W, Hh);
      // a floor line under the figure, drifting slowly
      const gy = OY + 566 * S, run = reduce ? 0 : sec * 40 * S;
      ctx.strokeStyle = "rgba(140,205,176,.22)"; ctx.lineWidth = 1.5;
      for (let x = (run % (70 * S)) - 70 * S; x < W; x += 70 * S) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + 34 * S, gy); ctx.stroke(); }
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
    const H = makeHorse(620, 7 + n * 13, { perVessel: 5, speed: .004, base, onlyOn: (k) => !!s[k] || k === cell.part, alpha: (k) => (s[k] || k === cell.part ? .95 : .5) });
    H.r = .9; H.w = .5;
    const phase0 = (n * .37) % 1, pace = 1 + ((n * 7) % 5) * .03; // every horse runs, each a little out of step with the others
    const m = { visible: false, draw(T, sec) { ctx.clearRect(0, 0, 224, 160); drawHorse(ctx, H, .3, -8, -24, (sec * pace / STRIDE + phase0) % 1, T, s, .5); } };
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
