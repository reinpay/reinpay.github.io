// A quiet pixel mosaic behind the hero: mint squares that fade in and out. Decoration only.
(() => {
  const cv = document.getElementById("mosaic"); if (!cv) return;
  const cx = cv.getContext("2d"), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = 26, G = 3; let cells = [], W = 0, H = 0;
  function size() {
    const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; cx.setTransform(d, 0, 0, d, 0, 0);
    cells = [];
    for (let y = 0; y < H; y += S) for (let x = 0; x < W; x += S) if (Math.random() < 0.34) cells.push({ x, y, a: Math.random() * 0.16, t: Math.random() * 0.16, brass: Math.random() < 0.08 });
    draw();
  }
  function draw() {
    cx.clearRect(0, 0, W, H);
    for (const c of cells) { cx.fillStyle = c.brass ? `rgba(226,176,87,${c.a * 0.9})` : `rgba(140,205,176,${c.a})`; cx.fillRect(c.x, c.y, S - G, S - G); }
  }
  function tick() {
    for (const c of cells) { if (Math.abs(c.a - c.t) < 0.004) c.t = Math.random() < 0.7 ? Math.random() * 0.05 : Math.random() * 0.2; c.a += (c.t - c.a) * 0.03; }
    draw(); requestAnimationFrame(tick);
  }
  addEventListener("resize", size); size(); if (!still) requestAnimationFrame(tick);
})();
