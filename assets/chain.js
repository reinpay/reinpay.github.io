// reinpay.app/chain: the page is built with the latest numbers; this refreshes them from assets/chain/stats.json.
(() => {
  const box = document.getElementById("oc"); if (!box) return;
  const $ = (id) => document.getElementById(id);
  const big = (raw, d) => { const v = BigInt(raw), u = 10n ** BigInt(d); return (v / u).toLocaleString("en-US"); };
  const dec = (raw, d) => (Number(BigInt(raw) / 10n ** BigInt(d - 6)) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  fetch(box.dataset.src + "?t=" + Date.now(), { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((D) => {
    if (!D || D.kind !== "reinpay-chain-stats") return;
    $("oc-burned").textContent = big(D.burned, D.decimals); $("oc-pct").textContent = D.burnedPct.toFixed(2);
    $("oc-fill").style.width = Math.max(D.burnedPct, 0.6) + "%"; $("oc-burns").textContent = D.burns.length;
    $("oc-circ").textContent = big(D.circulating, D.decimals); $("oc-holders").textContent = D.holders;
    $("oc-block").textContent = D.block.toLocaleString("en-US"); $("oc-at").textContent = D.at.slice(0, 16).replace("T", " ") + " UTC";
    const ex = "https://robinhoodchain.blockscout.com", tb = $("oc-rows"); tb.textContent = "";
    for (const b of D.burns) { const tr = document.createElement("tr"); tr.innerHTML = `<td>#${b.n}</td><td>${b.time.slice(0, 10)}</td><td class="num">${dec(b.amount, D.decimals)}</td><td><a target="_blank" rel="noopener"><code></code></a></td>`; const a = tr.querySelector("a"); a.href = `${ex}/tx/${b.tx}`; a.querySelector("code").textContent = b.tx.slice(0, 10) + "…" + b.tx.slice(-6); tb.appendChild(tr); }
  }).catch(() => {});
})();
