
(() => {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still) return; // the static page above is complete on its own
  const CHECKS = ["payee", "max", "budget", "repeat", "approval", "simulation"];
  const DAILY = 25;
  // stop: index of the check that decides (null = passes all); kind: sent | wait | stop
  const SEQ = [
    { who: "Weather API", amt: 4, memo: "6-hour forecast bundle", stop: null, kind: "sent" },
    { who: "GPU credits", amt: 8, memo: "2 hours of compute", stop: 4, kind: "wait", why: "above your approval line of 5 USDG" },
    { who: "Weather API", amt: 4, memo: "6-hour forecast bundle", stop: 3, kind: "wait", why: "same payment a few minutes ago" },
    { who: "cheap-gpu.example", amt: 25, memo: "cheaper GPU hours", stop: 0, kind: "stop", why: "not on your payee list" },
    { who: "Translation service", amt: 4.5, memo: "translate the onboarding guide", stop: null, kind: "sent" },
    { who: "Domain renewals", amt: 14, memo: "renew two domains", stop: 1, kind: "stop", why: "above the max of 10 USDG per payment" },
    { who: "Weather API", amt: 3, memo: "extra city", stop: null, kind: "sent" },
    { who: "Map tiles", amt: 4, memo: "tile pack", stop: 5, kind: "stop", why: "the simulation showed a second transfer out; refused" },
  ];
  const $ = (id) => document.getElementById(id);
  const stack = $("stack");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let spent = 0, n = 44, cycle = 0;
  const money = (v) => v.toFixed(2);
  function meter() {
    if (!$("m-spent")) return;
    $("m-spent").textContent = money(spent);
    $("m-left").textContent = money(Math.max(0, DAILY - spent)) + " left";
    $("m-fill").style.width = Math.min(100, (spent / DAILY) * 100) + "%";
  }
  function card(item) {
    const el = document.createElement("div");
    el.className = "receipt checking enter";
    el.innerHTML = `<span class="who"></span><span class="amt"></span><span class="why"><span class="pill">checking</span>&nbsp; <span class="w"></span></span><span class="checks"></span><span class="meta"></span>`;
    el.querySelector(".who").textContent = item.who;
    el.querySelector(".amt").textContent = money(item.amt) + " USDG";
    el.querySelector(".w").textContent = item.memo;
    el.querySelector(".meta").textContent = "RP-000" + (++n) + " · agent request";
    const box = el.querySelector(".checks");
    for (const c of CHECKS) { const s = document.createElement("span"); s.className = "ck"; s.textContent = c; box.append(s); }
    return el;
  }
  async function play(item) {
    if (!stack) return;
    const el = card(item);
    stack.prepend(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("enter")));
    // keep four cards; the oldest slides out
    const cards = [...stack.querySelectorAll(".receipt")];
    for (const old of cards.slice(4)) { old.classList.add("leave"); setTimeout(() => old.remove(), 460); }
    await sleep(500);
    const cks = el.querySelectorAll(".ck");
    for (let i = 0; i < CHECKS.length; i++) {
      const stopHere = item.stop === i;
      cks[i].classList.add("on", stopHere ? (item.kind === "wait" ? "hold" : "no") : "ok");
      cks[i].textContent = (stopHere ? (item.kind === "wait" ? "⏸ " : "✕ ") : "✓ ") + CHECKS[i];
      await sleep(330);
      if (stopHere) break;
    }
    el.classList.remove("checking");
    el.classList.add(item.kind);
    const pill = el.querySelector(".pill");
    pill.textContent = { sent: "within rules", wait: "waiting for you", stop: "blocked" }[item.kind];
    el.querySelector(".w").textContent = item.kind === "sent" ? item.memo : item.why;
    el.querySelector(".meta").textContent += item.kind === "sent" ? " · simulated on mainnet, one transfer out" : item.kind === "wait" ? " · reinpay approve to send" : " · nothing was signed";
    if (item.kind === "sent") { spent += item.amt; meter(); }
  }
  // flow strip: one dot per request, synced with the receipts
  const SVGNS = "http://www.w3.org/2000/svg";
  const lightsG = $("fl-lights"), dotsG = $("fl-dots"), pulse = $("fl-pulse");
  const hasFlow = !!lightsG;
  const lights = !hasFlow ? [] : CHECKS.map((c, i) => { const el = document.createElementNS(SVGNS, "circle"); el.setAttribute("cx", 440 + i * 24); el.setAttribute("cy", 86); el.setAttribute("r", 6); el.setAttribute("class", "fl-light"); const t = document.createElementNS(SVGNS, "title"); t.textContent = c; el.append(t); lightsG.append(el); return el; });
  const counts = { sent: 0, wait: 0, stop: 0 };
  const tray = [];
  const color = { sent: "var(--ok)", wait: "var(--wait)", stop: "var(--stop)" };
  function tween(el, from, to, ms, ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)) {
    return new Promise((done) => {
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms), e = ease(k);
        for (const key of Object.keys(to)) el.setAttribute(key, from[key] + (to[key] - from[key]) * e);
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  }
  async function flow(item) {
    if (!hasFlow) return;
    const dot = document.createElementNS(SVGNS, "circle");
    dot.setAttribute("r", 9); dot.setAttribute("cx", 190); dot.setAttribute("cy", 80);
    dot.style.fill = "var(--brass)"; dot.style.color = "var(--brass)";
    dotsG.append(dot);
    await tween(dot, { cx: 190 }, { cx: 400 }, 700);
    for (const l of lights) l.setAttribute("class", "fl-light");
    for (let i = 0; i < lights.length; i++) {
      const stopHere = item.stop === i;
      lights[i].setAttribute("class", "fl-light " + (stopHere ? (item.kind === "wait" ? "hold" : "no") : "ok"));
      await sleep(300);
      if (stopHere) break;
    }
    dot.style.fill = color[item.kind]; dot.style.color = color[item.kind];
    counts[item.kind]++;
    $("fl-count").textContent = `${counts.sent} sent · ${counts.wait} waiting · ${counts.stop} blocked`;
    if (item.kind === "sent") {
      await tween(dot, { cx: 400 }, { cx: 810 }, 850);
      pulse.classList.remove("go"); void pulse.getBBox(); pulse.classList.add("go");
      await tween(dot, { r: 9 }, { r: 0 }, 250);
      dot.remove();
    } else if (item.kind === "wait") {
      const slot = tray.length % 4;
      await tween(dot, { cx: 400, cy: 80 }, { cx: 458 + slot * 28, cy: 162 }, 650);
      dot.setAttribute("r", 7);
      tray.push(dot);
      if (tray.length > 4) tray.shift().remove();
    } else {
      await tween(dot, { cx: 400 }, { cx: 250 }, 650, (t) => t);
      await tween(dot, { r: 9 }, { r: 0 }, 300);
      dot.remove();
    }
  }
  function resetFlow() {
    if (!hasFlow) return;
    for (const d of tray.splice(0)) d.remove();
    counts.sent = counts.wait = counts.stop = 0;
    $("fl-count").textContent = "0 sent · 0 waiting · 0 blocked";
  }
  async function heroLoop() {
    if (!stack && !hasFlow) return;
    if (stack) stack.classList.add("live");
    spent = 6; meter();
    await sleep(1600);
    for (;;) {
      for (const item of SEQ) {
        if (document.hidden) { await sleep(800); continue; }
        await Promise.all([play(item), flow(item)]);
        await sleep(1400);
      }
      cycle++;
      spent = 0; meter(); resetFlow(); // a new day
      await sleep(900);
    }
  }

  // Rules tracer: one example request walks down the list and stops where a rule decides.
  const EX = [
    { label: "Weather API · 4 USDG", stop: null, res: "passes every check, then the simulation", kind: "ok" },
    { label: "GPU credits · 8 USDG", stop: 4, res: "waits for you", kind: "wait" },
    { label: "cheap-gpu.example · 25 USDG", stop: 0, res: "blocked", kind: "stop" },
    { label: "Weather API · 4 USDG, again", stop: 3, res: "held by the repeat guard", kind: "wait" },
  ];
  const lis = [...document.querySelectorAll("#order li")];
  const tracer = $("tracer");
  const slider = document.createElement("div"); slider.className = "slider"; if ($("order")) $("order").prepend(slider);
  const moveTo = (li) => { slider.style.opacity = "1"; slider.style.transform = `translateY(${li.offsetTop}px)`; slider.style.height = li.offsetHeight + "px"; };
  function clear() { for (const li of lis) li.className = ""; slider.className = "slider"; }
  async function traceLoop() {
    if (!lis.length) return;
    for (let k = 0; ; k = (k + 1) % EX.length) {
      const ex = EX[k];
      clear();
      tracer.innerHTML = `<span>Request</span><span class="req"></span><span class="res"></span>`;
      tracer.querySelector(".req").textContent = ex.label;
      await sleep(700);
      for (let i = 0; i < lis.length; i++) {
        moveTo(lis[i]);
        await sleep(620);
        if (ex.stop === i) {
          slider.classList.add(ex.kind === "wait" ? "wait" : "stop");
          for (let j = i + 1; j < lis.length; j++) lis[j].classList.add("dim");
          break;
        }
        lis[i].classList.add("pass");
      }
      const res = tracer.querySelector(".res");
      res.textContent = "→ " + ex.res;
      res.style.color = ex.kind === "ok" ? "var(--ok)" : ex.kind === "wait" ? "var(--wait)" : "var(--stop)";
      await sleep(2600);
      slider.style.opacity = "0";
      await sleep(350);
    }
  }
  // headline: words rise in on load
  document.documentElement.classList.add("js-motion");
  const h1 = document.querySelector(".hero h1");
  let w = 0;
  const wrapWords = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(part); continue; }
          const s = document.createElement("span"); s.className = "wd"; s.textContent = part; s.style.animationDelay = (w++ * 0.09) + "s"; frag.append(s);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1) wrapWords(child);
    }
  };
  if (h1) wrapWords(h1);

  // sections slide in when they reach the screen (always readable at rest)
  const reveals = [...document.querySelectorAll("section.band .side, section.band ol.order, section.band .split, section.band pre, section.band .tablewrap, .flowbox, .reveal, .section-head, .bullet, details.faq, .toolrow, .cta-box")];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.remove("pre"); io.unobserve(e.target); }
  }, { threshold: 0.15 });
  for (const el of reveals) {
    el.classList.add("reveal");
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight) { el.classList.add("pre"); io.observe(el); }
  }

  // terminal: commands appear line by line the first time it is seen
  const pre = document.querySelector("#start pre");
  if (pre) {
  const lines = pre.innerHTML.split("\n");
  pre.innerHTML = lines.map((l) => `<span class="ln">${l || "&nbsp;"}</span>`).join("");
  const lns = [...pre.querySelectorAll(".ln")];
  const cursor = document.createElement("span"); cursor.className = "cursor";
  lns[lns.length - 1].append(cursor);
  const typeIo = new IntersectionObserver(async (entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    typeIo.disconnect();
    pre.classList.add("typing");
    for (const ln of lns) { ln.classList.add("on"); ln.append(cursor); await sleep(ln.textContent.trim() ? 260 : 120); }
  }, { threshold: 0.4 });
  if (pre.getBoundingClientRect().top > innerHeight) typeIo.observe(pre);
  }

  heroLoop();
  traceLoop();
})();
document.getElementById("copy")?.addEventListener("click", async (e) => {
  const b = e.currentTarget;
  try { await navigator.clipboard.writeText("hello@reinpay.app"); b.textContent = "Copied"; }
  catch { const r = document.createRange(); r.selectNodeContents(document.getElementById("mail")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected"; }
  setTimeout(() => { b.textContent = "Copy"; }, 1800);
});
