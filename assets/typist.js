// Reinpay Intelligence at work: the computer-head figure seated at a desk, typing. Dot-drawn like the rest of the site.
// makeTypist() returns draw(g, cx, cy, size, sec); size is the width in pixels of the whole scene (desk included).
export function makeTypist() {
  // shapes in a 1000 x 700 design space, three-quarter view: figure on the left, facing the monitor on the right
  const SH = {
    head: "M250 96 L430 96 Q442 96 442 108 L442 222 Q442 234 430 234 L250 234 Q238 234 238 222 L238 108 Q238 96 250 96 Z",
    neck: "M322 234 L358 234 L362 262 L318 262 Z",
    torso: "M268 266 Q340 252 412 268 L438 330 L430 452 Q350 470 270 452 L262 330 Z",
    upperL: "M286 276 L262 290 L300 392 L330 380 Z",
    upperR: "M402 276 L432 290 L470 382 L440 396 Z",
    thigh: "M282 446 L432 446 L560 470 L560 520 L420 512 L282 500 Z",
    shin: "M520 470 L566 470 L572 640 L534 640 Z",
  };
  const BOX = { head: [236, 94, 444, 236], neck: [316, 232, 364, 264], torso: [258, 250, 440, 472], upperL: [258, 274, 334, 396], upperR: [398, 274, 474, 398], thigh: [280, 444, 562, 522], shin: [518, 468, 574, 642] };
  const SHARE = { head: .22, neck: .02, torso: .3, upperL: .07, upperR: .07, thigh: .2, shin: .07 };
  function sample(n) {
    const t = document.createElement("canvas").getContext("2d"); let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647, out = [];
    for (const [k, d] of Object.entries(SH)) {
      const p = new Path2D(d), [x0, y0, x1, y1] = BOX[k]; let m = 0, c = 0;
      while (m < n * SHARE[k] && c < 90000) {
        c++; const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0); if (!t.isPointInPath(p, x, y)) continue;
        if (k === "head" && x > 254 && x < 426 && y > 112 && y < 218) continue; // the screen face stays clear
        let e = 0; for (const [a, b] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (!t.isPointInPath(p, x + a, y + b)) e++;
        if (!e && r() > .42) continue; out.push({ x, y, k, e: e > 0, ph: r() * 6.28 }); m++;
      }
    }
    return out;
  }
  const DOTS = sample(5200);
  // props drawn with the same dots: monitor bezel and stand, keyboard, chair
  const PROPS = {
    bezel: ["M620 150 L960 150 Q972 150 972 162 L972 382 Q972 394 960 394 L620 394 Q608 394 608 382 L608 162 Q608 150 620 150 Z", [606, 148, 974, 396], 1300, [628, 168, 952, 376]],
    stand: ["M778 394 L802 394 L806 424 L774 424 Z M730 424 L850 424 L854 432 L726 432 Z", [724, 392, 856, 434], 220],
    keyboard: ["M462 412 L652 412 L664 432 L450 432 Z", [448, 410, 666, 434], 420],
    back: ["M226 250 L262 244 L268 470 L232 474 Z", [224, 242, 270, 476], 380],
    seat: ["M232 470 L452 474 L448 498 L236 494 Z", [230, 468, 454, 500], 380],
    post: ["M332 498 L350 498 L350 612 L332 612 Z M270 612 L412 612 L412 624 L270 624 Z", [268, 496, 414, 626], 260],
  };
  const PD = []; { const t = document.createElement("canvas").getContext("2d"); let sd = 11; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (const [k, [d, [x0, y0, x1, y1], n, hole]] of Object.entries(PROPS)) { const p = new Path2D(d); let m = 0, c = 0;
      while (m < n && c < 80000) { c++; const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0); if (!t.isPointInPath(p, x, y)) continue; if (hole && x > hole[0] && x < hole[2] && y > hole[1] && y < hole[3]) continue;
        let e = 0; for (const [a, b] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (!t.isPointInPath(p, x + a, y + b) || (hole && x + a > hole[0] && x + a < hole[2] && y + b > hole[1] && y + b < hole[3])) e++;
        if (!e && r() > .45) continue; PD.push({ x, y, k, e: e > 0 }); m++; } } }
  let fs0 = 3; const rnd = () => (fs0 = (fs0 * 16807) % 2147483647) / 2147483647;
  const FA = Array.from({ length: 400 }, () => { const e = rnd() < .45; return { t: rnd(), a: e ? (rnd() < .5 ? -1 : 1) * (.85 + rnd() * .15) : rnd() * 2 - 1 }; });
  const HAND = Array.from({ length: 70 }, () => { const a = rnd() * 6.283, r = Math.sqrt(rnd()); return { x: Math.cos(a) * r * 13, y: Math.sin(a) * r * 7 }; });
  const CODE = ["reinpay check \"GPU credits\" 0.0015", "→ waits for you · approval line", "reinpay scan 0x9e9a…1293", "→ wallet · safe to pay", "reinpay x402 check api.example", "→ payee on list · dry run ok", "reinpay burns", "→ 8 burns · 17,808,188 REINPAY", "reinpay status", "→ block 119,6xx,xxx · 0.10 s", "reinpay rules hardened", "→ 6 checks · first fail decides"];
  const keys = [];


  return function draw(g, cx, cy, size, s) {
    const S = size / 1060, OX = cx - 600 * S, OY = cy - 400 * S, X = (x) => OX + x * S, Y = (y) => OY + y * S;
    // desk
    g.strokeStyle = "rgba(95,240,168,.55)"; g.lineWidth = 2; g.beginPath(); g.moveTo(X(470), Y(430)); g.lineTo(X(960), Y(430)); g.stroke();
    g.fillStyle = "rgba(95,240,168,.06)"; g.fillRect(X(470), Y(430), 490 * S, 14 * S);
    g.strokeStyle = "rgba(95,240,168,.3)"; for (const lx of [500, 930]) { g.beginPath(); g.moveTo(X(lx), Y(444)); g.lineTo(X(lx), Y(650)); g.stroke(); }
    // monitor on the desk
    const mx0 = 628, my0 = 168, mw = 324, mh = 208;
    // props in dots
    for (const d of PD) { const kb = d.k === "keyboard", r = (d.e ? 1.3 : 1) * Math.max(.8, S * 1.2); g.fillStyle = d.e ? (kb || d.k === "bezel" || d.k === "stand" ? "rgba(140,205,176,.95)" : "rgba(214,228,220,.75)") : (kb || d.k === "bezel" || d.k === "stand" ? "rgba(140,205,176,.35)" : "rgba(214,228,220,.28)"); g.fillRect(X(d.x) - r, Y(d.y) - r, r * 2, r * 2); }
    // screen with a glow
    g.fillStyle = "rgba(5,20,12,.96)"; g.fillRect(X(mx0), Y(my0), mw * S, mh * S);
    g.strokeStyle = "#5ff0a8"; g.lineWidth = 2; g.shadowColor = "#5ff0a8"; g.shadowBlur = 22; g.strokeRect(X(mx0), Y(my0), mw * S, mh * S); g.shadowBlur = 0;
    const sg = g.createRadialGradient(X(790), Y(272), 0, X(790), Y(272), 260 * S); sg.addColorStop(0, "rgba(95,240,168,.10)"); sg.addColorStop(1, "rgba(95,240,168,0)"); g.fillStyle = sg; g.fillRect(X(560), Y(120), 460 * S, 360 * S);
    // scrolling code on the monitor, typed out character by character
    g.save(); g.beginPath(); g.rect(X(mx0 + 8), Y(my0 + 8), (mw - 16) * S, (mh - 16) * S); g.clip();
    const rate = 14, total = s * rate, fs = 12.5 * S; g.font = `500 ${fs}px "IBM Plex Mono"`;
    let used = 0, lineIdx = 0, lines = [];
    while (true) { const L = CODE[lineIdx % CODE.length]; if (used + L.length + 6 > total) { lines.push(L.slice(0, Math.max(0, total - used))); break; } lines.push(L); used += L.length + 6; lineIdx++; }
    const show = lines.slice(-9);
    show.forEach((L, i) => { const out = L.startsWith("→"); g.fillStyle = out ? "#8ccdb0" : "#5ff0a8"; g.fillText((out ? "  " : "$ ") + L, X(mx0 + 16), Y(my0 + 28 + i * 20)); });
    const last = show[show.length - 1] || ""; if (Math.floor(s * 2) % 2 === 0) { g.fillStyle = "#5ff0a8"; g.fillRect(X(mx0 + 16) + g.measureText("$ " + last).width + 2, Y(my0 + 28 + (show.length - 1) * 20) - fs * .8, fs * .55, fs * .95); }
    g.restore();

    // keyboard
    // keyboard keys: two rows that light up as they are pressed
    for (let row = 0; row < 2; row++) for (let k = 0; k < 12; k++) { const kx = 470 + row * 6 + k * 15, ky = 416 + row * 8, hot = ((k * 7 + row * 3 + Math.floor(s * 12)) % 17) < 2;
      g.fillStyle = hot ? "rgba(95,240,168,.95)" : "rgba(95,240,168,.22)"; if (hot) { g.shadowColor = "#5ff0a8"; g.shadowBlur = 8; } g.fillRect(X(kx), Y(ky), 11 * S, 5 * S); g.shadowBlur = 0; }

    // typing hands: forearms from the elbows to the keys, fingers bouncing
    const elbowL = [318, 388], elbowR = [452, 392];
    const typeL = Math.sin(s * 17) > 0.3, typeR = Math.sin(s * 19 + 1.7) > 0.3;
    const handL = [508 + Math.sin(s * 3) * 8, 408 - (typeL ? 7 : 0)], handR = [592 + Math.cos(s * 2.6) * 10, 408 - (typeR ? 7 : 0)];
    for (const [[ex, ey], [hx, hy], t] of [[elbowL, handL, typeL], [elbowR, handR, typeR]]) {
      // forearm drawn with dots, like the rest of the body
      const len = Math.hypot(hx - ex, hy - ey), n = Math.round(len * 1.6);
      for (let i = 0; i < n; i++) { const q = FA[i % FA.length], tt = q.t, px = ex + (hx - ex) * tt, py = ey + (hy - ey) * tt, w = 9 - tt * 2.5, ox = q.a * w * -(hy - ey) / len, oy = q.a * w * (hx - ex) / len, edge = Math.abs(q.a) > .8;
        const rr = (edge ? 1.3 : 1) * Math.max(.8, S * 1.2); g.fillStyle = edge ? "rgba(214,228,220,.88)" : "rgba(214,228,220,.4)"; g.fillRect(X(px + ox) - rr, Y(py + oy) - rr, rr * 2, rr * 2); }
      // hand: a small cluster of dots with glowing fingertips
      for (const q of HAND) { const rr = Math.max(.8, S * 1.2); g.fillStyle = "rgba(214,228,220,.85)"; g.fillRect(X(hx + q.x) - rr, Y(hy + q.y) - rr, rr * 2, rr * 2); }
      g.fillStyle = t ? "#5ff0a8" : "rgba(95,240,168,.5)"; g.shadowColor = "#5ff0a8"; g.shadowBlur = t ? 10 : 0; for (const fx of [6, 11, 16]) { g.beginPath(); g.arc(X(hx + fx), Y(hy + 6), 1.8 * S + .5, 0, 6.283); g.fill(); } g.shadowBlur = 0;
      if (t && Math.random() < .5) keys.push({ x: hx + (Math.random() - .5) * 16, y: 416, t: s });
    }
    // key sparks
    for (let i = keys.length - 1; i >= 0; i--) { const k = keys[i], a = s - k.t; if (a > .5) { keys.splice(i, 1); continue; } g.fillStyle = `rgba(95,240,168,${1 - a * 2})`; g.beginPath(); g.arc(X(k.x), Y(k.y - a * 40), (1 - a) * 3 * S + 1, 0, 6.283); g.fill(); }

    // the figure itself, dot by dot, breathing slightly
    const br = Math.sin(s * 1.5) * 1.5;
    for (let b = 0; b < 2; b++) for (const d of DOTS) {
      if ((b === 0) !== !d.e) continue;
      const lift = d.k === "head" || d.k === "neck" ? br * .6 + (typeL || typeR ? .8 : 0) : d.k === "torso" || d.k.startsWith("upper") ? br : 0;
      const r = (d.e ? 1.3 : 1) * Math.max(.8, S * 1.2);
      g.fillStyle = d.e ? "rgba(214,228,220,.88)" : "rgba(214,228,220,.38)";
      g.fillRect(X(d.x + Math.sin(s * 1.2 + d.ph) * .5) - r, Y(d.y + lift) - r, r * 2, r * 2);
    }
    // the head is a screen, eyes looking right at the monitor, a line of its own work below
    const hl = br * .6;
    g.fillStyle = "rgba(5,20,12,.95)"; g.fillRect(X(254), Y(112 + hl), 172 * S, 106 * S);
    g.strokeStyle = "#5ff0a8"; g.lineWidth = 2; g.strokeRect(X(254), Y(112 + hl), 172 * S, 106 * S);
    const look = 10 + Math.sin(s * .7) * 4, blink = (s % 4.2) < .12;
    g.fillStyle = "#5ff0a8"; g.shadowColor = "#5ff0a8"; g.shadowBlur = 12;
    for (const ex of [300, 360]) { const h = blink ? 2 : 22; g.fillRect(X(ex + look), Y(150 + hl) - (h * S) / 2, 18 * S, h * S); }
    g.shadowBlur = 0; g.font = `500 ${10 * S}px "IBM Plex Mono"`; g.fillStyle = "#8ccdb0";
    g.fillText(["> typing…", "> checking rules", "> nothing signed"][Math.floor(s / 2) % 3], X(266), Y(206 + hl));
  };
}
