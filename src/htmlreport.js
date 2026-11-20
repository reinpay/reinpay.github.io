// reinpay report --html: the spending report as one self-contained HTML file (no scripts, no outside requests),
// with a bar chart per token. Every value from receipts is escaped: payee names and memos are text, never markup.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function chart(rep, token) {
  const days = rep.perDay.slice().reverse(); // oldest first
  const vals = days.map((d) => Number(d.tokens[token]?.sent || 0));
  const max = Math.max(...vals, 1e-12), W = 640, H = 160, bw = W / Math.max(days.length, 1);
  const bars = vals.map((v, i) => { const h = Math.round((v / max) * (H - 24)); return `<rect x="${(i * bw + bw * 0.15).toFixed(1)}" y="${H - 18 - h}" width="${(bw * 0.7).toFixed(1)}" height="${h}" rx="2"><title>${esc(days[i].day)}: ${esc(v)} ${esc(token)}</title></rect>`; }).join("");
  const labels = days.map((d, i) => (i % Math.ceil(days.length / 7) === 0 ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(d.day.slice(5))}</text>` : "")).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(token)} sent per day">${bars}${labels}</svg>`;
}

export function reportHTML(rep, { wallet = "", generatedAt = new Date().toISOString() } = {}) {
  const toks = Object.keys(rep.totals);
  const rows = (arr, cols) => arr.map((r) => `<tr>${cols.map((c) => `<td>${esc(c(r))}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reinpay report ${esc(rep.from)} to ${esc(rep.to)}</title>
<style>
:root{--bg:#f7f9f6;--ink:#17231d;--muted:#5a6a61;--line:#d6ded7;--bar:#1f4a3a;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0b110e;--ink:#e6eee8;--muted:#93a39a;--line:#223029;--bar:#8ccdb0}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,sans-serif;padding:24px 16px}
main{max-width:760px;margin:0 auto}h1{font-size:24px;margin:0}h2{font-size:17px;margin:28px 0 8px}.m{color:var(--muted);font-size:13px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}td,th{text-align:left;padding:7px 8px;border-top:1px solid var(--line);font-size:14px}th{color:var(--muted);font-weight:500}
svg{width:100%;height:auto}svg rect{fill:var(--bar)}svg text{fill:var(--muted);font-size:10px}
</style></head><body><main>
<h1>Reinpay spending, ${esc(rep.from)} to ${esc(rep.to)}</h1>
<p class="m">${rep.days} day${rep.days === 1 ? "" : "s"}${wallet ? ` · wallet ${esc(wallet)}` : ""} · made ${esc(generatedAt)} from local receipts. Check any payment with reinpay verify.</p>
${toks.length ? "" : "<p>No payment requests in this period.</p>"}
${toks.map((t) => { const x = rep.totals[t]; return `<h2>${esc(t)}</h2><table><tr><th>Sent</th><th>Payments</th><th>Waiting</th><th>Blocked</th></tr><tr><td>${esc(x.sent)} ${esc(t)}</td><td>${x.sentCount}</td><td>${esc(x.waiting)} (${x.waitingCount})</td><td>${x.blockedCount}</td></tr></table>${chart(rep, t)}`; }).join("")}
${rep.topPayees.length ? `<h2>Top payees</h2><table><tr><th>Payee</th><th>Sent</th><th>Payments</th></tr>${rows(rep.topPayees, [(p) => p.payee, (p) => `${p.sent} ${p.token}`, (p) => p.payments])}</table>` : ""}
${rep.byCategory?.length ? `<h2>By category</h2><table><tr><th>Category</th><th>Sent</th><th>Payments</th></tr>${rows(rep.byCategory, [(c) => c.category, (c) => `${c.sent} ${c.token}`, (c) => c.payments])}</table>` : ""}
${rep.blockedBy.length ? `<h2>Blocked by</h2><table><tr><th>Rule</th><th>Requests</th></tr>${rows(rep.blockedBy, [(b) => b.rule, (b) => b.count])}</table>` : ""}
</main></body></html>
`;
}
