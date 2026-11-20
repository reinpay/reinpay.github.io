// Page headers: Reinpay Intelligence (a figure with a terminal for a head) in a small network of this page's topics.
(() => {
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SH = { head: "M210 70 L390 70 Q402 70 402 82 L402 196 Q402 208 390 208 L210 208 Q198 208 198 196 L198 82 Q198 70 210 70 Z", neck: "M282 208 L318 208 L322 236 L278 236 Z", torso: "M232 240 Q300 228 368 240 L388 300 L376 420 Q300 436 224 420 L212 300 Z", armL: "M232 244 L204 252 L170 360 L158 452 L178 456 L196 366 L224 300 Z", armR: "M368 244 L396 252 L430 360 L442 452 L422 456 L404 366 L376 300 Z" };
  const BOX = { head: [196, 68, 404, 210], neck: [276, 206, 324, 238], torso: [210, 226, 390, 438], armL: [156, 242, 236, 458], armR: [364, 242, 444, 458] };
  const t = document.createElement("canvas").getContext("2d"); let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; const dots = [];
  for (const [k, d] of Object.entries(SH)) { const p = new Path2D(d), [x0, y0, x1, y1] = BOX[k]; let m = 0, c = 0; while (m < (k === "head" ? 650 : 480) && c < 50000) { c++; const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0); if (!t.isPointInPath(p, x, y)) continue; if (k === "head" && x > 214 && x < 386 && y > 84 && y < 194) continue; let e = 0; for (const [a, b] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (!t.isPointInPath(p, x + a, y + b)) e++; if (!e && rnd() > .45) continue; dots.push({ x, y, e: e > 0, ph: rnd() * 6.28 }); m++; } }
  const SLOTS = [[-.30, -.34], [.30, -.36], [.42, -.06], [.34, .30], [-.02, .42], [-.36, .30], [-.44, -.04], [.12, -.44]];
  document.querySelectorAll("canvas.ph-net").forEach((cv) => {
    const g = cv.getContext("2d"), names = (cv.dataset.nodes || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, SLOTS.length), lines = (cv.dataset.lines || "> rules sealed ok|> waits for your yes").split("|");
    let W, H; const fit = () => { const dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    new ResizeObserver(fit).observe(cv); fit();
    const pulses = Array.from({ length: 8 }, () => ({ n: Math.floor(Math.random() * Math.max(1, names.length)), t: Math.random(), sp: .004 + Math.random() * .005 }));
    let vis = true; new IntersectionObserver(([e]) => (vis = e.isIntersecting)).observe(cv);
    const frame = (now) => {
      requestAnimationFrame(frame); if (!vis && !RM) return;
      const sec = RM ? 2 : now / 1000, wide = W > 900, cx = W * (wide ? .72 : .5), cy = H * .5, SX = wide ? .42 : .9; g.clearRect(0, 0, W, H);
      g.strokeStyle = "rgba(95,240,168,.05)"; g.lineWidth = 1; for (let x = cx % 40; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = cy % 40; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let i = 0; i < 2; i++) { g.save(); g.translate(cx, cy); g.rotate(sec * .05 * (i ? 1 : -1) + i); g.strokeStyle = `rgba(95,240,168,${.14 - i * .05})`; g.beginPath(); g.ellipse(0, 0, Math.min(W, H) * (.5 + i * .15), Math.min(W, H) * (.18 + i * .06), 0, 0, 6.283); g.stroke(); g.restore(); }
      const pos = names.map((_, i) => [cx + SLOTS[i][0] * W * SX, cy + SLOTS[i][1] * H * 1.0]);
      pos.forEach(([x, y]) => { g.strokeStyle = "rgba(95,240,168,.22)"; g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo((cx + x) / 2 + (y - cy) * .15, (cy + y) / 2 - (x - cx) * .15, x, y); g.stroke(); });
      if (names.length) for (const p of pulses) { if (!RM) p.t += p.sp; if (p.t > 1) { p.t = 0; p.n = Math.floor(Math.random() * names.length); } const [x, y] = pos[p.n], q = p.t, mx = (cx + x) / 2 + (y - cy) * .15, my = (cy + y) / 2 - (x - cx) * .15; g.fillStyle = "#5ff0a8"; g.shadowColor = "#5ff0a8"; g.shadowBlur = 8; g.beginPath(); g.arc((1 - q) ** 2 * x + 2 * (1 - q) * q * mx + q * q * cx, (1 - q) ** 2 * y + 2 * (1 - q) * q * my + q * q * cy, 2.2, 0, 6.283); g.fill(); g.shadowBlur = 0; }
      g.font = '500 10.5px "IBM Plex Mono", monospace';
      names.forEach((n, i) => { const [x, y] = pos[i]; g.strokeStyle = i % 3 ? "#5ff0a8" : "#7aa7ff"; g.fillStyle = "#070b09"; g.lineWidth = 1.4; g.fillRect(x - 5, y - 5, 10, 10); g.strokeRect(x - 5, y - 5, 10, 10); g.fillStyle = "rgba(200,220,210,.75)"; g.fillText(n, x + 10, y + 4); });
      const S = Math.min(W * (wide ? .4 : .9), H) / 560, ox = cx - 300 * S, oy = cy - 262 * S, br = Math.sin(sec * 1.6) * 1.4;
      g.fillStyle = "rgba(7,11,9,.85)"; g.beginPath(); g.arc(cx, cy - 20 * S, 175 * S, 0, 6.283); g.fill();
      for (const d of dots) { const r = (d.e ? 1 : .75) * Math.max(.7, S); g.fillStyle = d.e ? "rgba(200,240,220,.9)" : "rgba(170,210,190,.55)"; g.fillRect(ox + d.x * S + Math.sin(sec * 1.2 + d.ph) * .5 - r, oy + (d.y + br) * S - r, r * 2, r * 2); }
      const X = (x) => ox + x * S, Y = (y) => oy + (y + br) * S;
      g.fillStyle = "rgba(5,20,12,.95)"; g.fillRect(X(214), Y(84), 172 * S, 110 * S);
      const eh = ((sec % 4) < .12 ? 2 : 18) * S; g.fillStyle = "#5ff0a8"; g.shadowColor = "#5ff0a8"; g.shadowBlur = 12; g.fillRect(X(262), Y(118) - eh / 2, 18 * S, eh); g.fillRect(X(320), Y(118) - eh / 2, 18 * S, eh); g.shadowBlur = 0;
      if (S > .5) { g.font = `500 ${Math.max(7, 9 * S)}px "IBM Plex Mono", monospace`; g.fillStyle = "rgba(95,240,168,.8)"; const b = Math.floor(sec / 2) % lines.length; g.fillText(lines[b], X(224), Y(166)); g.fillText(lines[(b + 1) % lines.length], X(224), Y(181)); }
      g.strokeStyle = "#5ff0a8"; g.lineWidth = 1.4; g.strokeRect(X(214), Y(84), 172 * S, 110 * S);
    };
    requestAnimationFrame(frame);
  });
})();
