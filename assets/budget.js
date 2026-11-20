// reinpay.app/budget: how far an agent's daily budget goes, from the published per-token prices in the page.
// It only calculates: no deposit, no swap, nothing is sent.
(() => {
  const box = document.getElementById("bg"); if (!box) return;
  const M = JSON.parse(box.dataset.models); // [{name, in, out}] USD per million tokens
  const $ = (id) => document.getElementById(id);
  const f = (n, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
  const big = (n) => (n >= 1e9 ? f(n / 1e9, 2) + "B" : n >= 1e6 ? f(n / 1e6, 2) + "M" : n >= 1e3 ? f(n / 1e3, 1) + "K" : f(n));
  let pick = 1;
  function draw() {
    const daily = +$("bg-daily").value, inT = +$("bg-in").value, outT = +$("bg-out").value, line = +$("bg-line").value;
    $("v-daily").textContent = f(daily, 2) + " USDG"; $("v-in").textContent = f(inT) + " tokens"; $("v-out").textContent = f(outT) + " tokens"; $("v-line").textContent = f(line, 2) + " USDG";
    const rows = M.map((m) => { const per = (inT * m.in + outT * m.out) / 1e6; return { ...m, per, calls: per > 0 ? Math.floor(daily / per) : 0, tokens: per > 0 ? Math.floor(daily / per) * (inT + outT) : 0 }; });
    const max = Math.max(...rows.map((r) => r.calls), 1);
    $("bg-rows").innerHTML = rows.map((r, i) => `<button type="button" class="bg-row${i === pick ? " on" : ""}" data-i="${i}"><span class="bg-n"><b>${r.name}</b><small>$${f(r.in, 2)} in · $${f(r.out, 2)} out / M tokens</small></span><span class="bg-bar"><i style="width:${(r.calls / max) * 100}%"></i></span><span class="bg-c"><b>${big(r.calls)}</b><small>calls / day</small></span><span class="bg-p"><b>$${r.per < 0.01 ? r.per.toFixed(5) : f(r.per, 4)}</b><small>per call</small></span></button>`).join("");
    $("bg-rows").querySelectorAll(".bg-row").forEach((b) => b.onclick = () => { pick = +b.dataset.i; draw(); });
    const r = rows[pick], cap = Math.min(daily, Math.max(line * 2, Math.ceil(r.per * 50 * 100) / 100)); // the max per payment sits above your line, so big ones wait and huge ones are blocked
    $("bg-name").textContent = r.name;
    $("bg-sum").innerHTML = `<div><small>CALLS A DAY</small><b>${f(r.calls)}</b></div><div><small>TOKENS A DAY</small><b>${big(r.tokens)}</b></div><div><small>COST PER CALL</small><b>$${r.per < 0.01 ? r.per.toFixed(5) : f(r.per, 4)}</b></div><div><small>CALLS IN ONE PAYMENT AT YOUR LINE</small><b>${r.per > 0 ? f(Math.floor(line / r.per)) : "—"}</b><span>above it, a payment waits for you</span></div>`;
    $("bg-cmd").textContent = `reinpay rule daily USDG ${daily}\nreinpay rule max USDG ${cap}\nreinpay rule approve-above USDG ${line}\nreinpay rules --plain`;
  }
  ["bg-daily", "bg-in", "bg-out", "bg-line"].forEach((id) => $(id).addEventListener("input", draw));
  box.querySelectorAll("[data-preset]").forEach((b) => b.onclick = () => { const [i, o] = b.dataset.preset.split(","); $("bg-in").value = i; $("bg-out").value = o; box.querySelectorAll("[data-preset]").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
  $("bg-copy").onclick = async (e) => { try { await navigator.clipboard.writeText($("bg-cmd").textContent); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select it"; } setTimeout(() => (e.target.textContent = "Copy"), 1500); };
  draw();
})();
