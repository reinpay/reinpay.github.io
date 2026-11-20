// Reinpay Scan: Robinhood Chain mainnet, read in your browser with plain JSON-RPC (and Sourcify for contract source).
// Nothing is sent anywhere else, nothing is signed. "Safe to pay?" uses the same verdict as `reinpay payee check`.
(() => {
  const root = document.getElementById("scan"); if (!root) return;
  const RPC = "https://rpc.mainnet.chain.robinhood.com", EX = "https://robinhoodchain.blockscout.com";
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const DEAD = "0x000000000000000000000000000000000000dead";
  const KNOWN = JSON.parse(root.dataset.tokens); // [{s, a, n}] USDG, REINPAY and the stock tokens
  const BYADDR = Object.fromEntries(KNOWN.map((t) => [t.a.toLowerCase(), t]));
  const $ = (id) => document.getElementById(id), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let rid = 0;
  async function rpc(calls) { // [[method, params], ...] -> results (null on error); the node takes at most ~50 per batch
    if (calls.length > 40) { const out = []; for (let i = 0; i < calls.length; i += 40) out.push(...(await rpc1(calls.slice(i, i + 40)))); return out; }
    return rpc1(calls);
  }
  async function rpc1(calls) {
    const body = calls.map(([m, p]) => ({ jsonrpc: "2.0", id: ++rid, method: m, params: p }));
    for (let i = 1; ; i++) {
      try {
        const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if ((r.status === 429 || r.status >= 500) && i < 4) { await new Promise((x) => setTimeout(x, 800 * i)); continue; }
        const j = await r.json(); const by = Object.fromEntries((Array.isArray(j) ? j : [j]).map((x) => [x.id, x]));
        return body.map((b) => (by[b.id]?.error ? { error: by[b.id].error.message } : by[b.id]?.result ?? null));
      } catch (e) { if (i >= 4) throw new Error("Robinhood Chain could not be reached. Try again in a moment."); await new Promise((x) => setTimeout(x, 900 * i)); }
    }
  }
  const one = async (m, p) => (await rpc([[m, p]]))[0];
  const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
  const units = (v, d, max = 4) => { const s = v.toString().padStart(d + 1, "0"), i = s.slice(0, s.length - d), f = s.slice(s.length - d).replace(/0+$/, "").slice(0, max); return BigInt(i).toLocaleString("en-US") + (f ? "." + f : ""); };
  const pad = (a) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");
  const word = (a) => a.slice(2).toLowerCase().padStart(64, "0");
  const str = (h) => { try { if (!h || h === "0x") return null; const b = h.slice(2); if (b.length === 64) return decodeURIComponent(b.replace(/(00)+$/, "").replace(/../g, "%$&")); const len = parseInt(b.slice(64, 128), 16); return decodeURIComponent(b.slice(128, 128 + len * 2).replace(/../g, "%$&")); } catch { return null; } };
  const ago = (ts) => { const s = Math.max(0, Math.round(Date.now() / 1000 - ts)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
  const short = (a) => a.slice(0, 8) + "…" + a.slice(-6);
  const link = (a, label) => `<a href="?q=${a}" data-q="${a}"><code>${esc(label || short(a))}</code></a>`;
  const kv = (k, v) => `<div class="sc-kv"><span>${k}</span><b>${v}</b></div>`;

  // ---------- live strip: latest blocks ----------
  let lastHead = 0;
  async function live() {
    try {
      const [h, gp] = await rpc([["eth_blockNumber", []], ["eth_gasPrice", []]]); const head = parseInt(h, 16);
      $("sc-head").textContent = head.toLocaleString("en-US"); $("sc-gas").textContent = (Number(big(gp)) / 1e9).toFixed(3) + " gwei";
      if (head !== lastHead) {
        lastHead = head; const ns = Array.from({ length: 6 }, (_, i) => head - i);
        const bs = await rpc(ns.map((n) => ["eth_getBlockByNumber", ["0x" + n.toString(16), false]]));
        $("sc-blocks").innerHTML = bs.filter(Boolean).map((b) => `<a class="sc-blk" href="?q=${parseInt(b.number, 16)}" data-q="${parseInt(b.number, 16)}"><b>#${parseInt(b.number, 16).toLocaleString("en-US")}</b><span>${b.transactions.length} tx · ${ago(parseInt(b.timestamp, 16))}</span></a>`).join("");
        if (bs[0] && bs[5]) $("sc-bt").textContent = ((parseInt(bs[0].timestamp, 16) - parseInt(bs[5].timestamp, 16)) / 5).toFixed(2) + "s";
      }
    } catch { /* the strip waits for the next tick */ }
  }
  let busy = false; live(); setInterval(() => { if (!document.hidden && !busy) live(); }, 6000);
  fetch(root.dataset.stats + "?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((D) => { if (D) $("sc-burn").textContent = (BigInt(D.burned) / 10n ** 18n).toLocaleString("en-US"); }).catch(() => {});

  // ---------- the verdict, same rules as reinpay payee check ----------
  function verdict(f) {
    if (f.token) return ["stop", "Do not pay", `This is the ${f.token} token contract. Tokens sent to a token contract are usually stuck for good; Reinpay refuses it as a payee.`];
    if (f.dead) return ["stop", "Do not pay", "This is the dead address. Anything sent here is burned for good."];
    if (f.code && !f.sourcify) return ["careful", "Be careful", "A contract whose code nobody can read on Sourcify. Ask the payee what it is, and whether it accepts plain transfers."];
    if (f.code) return ["careful", "Be careful", "A verified contract. Make sure it is meant to receive plain transfers of the token you will pay."];
    if (f.nonce === 0) return ["careful", "Be careful", "A fresh address with no history. That can be fine, but confirm it with the payee another way."];
    return ["ok", "Looks fine", "A wallet with a history on Robinhood Chain. Still confirm the address with the payee."];
  }

  // ---------- transfers in and out of an address, recent blocks ----------
  async function transfers(addr, head) {
    // The node answers a token-filtered log query for about 100,000 blocks at a time, so walk back in steps of that
    // size, five steps per request, until 15 transfers are found or 2,000,000 blocks are read.
    const tokens = KNOWN.map((t) => t.a), STEP = 100000, found = []; let to = head, read = 0;
    while (found.length < 15 && read < 2000000 && to > 0) {
      const calls = [];
      for (let k = 0; k < 5 && to > 0; k++) { const from = Math.max(0, to - STEP + 1), f = (t) => ({ fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), address: tokens, topics: t }); calls.push(["eth_getLogs", [f([TRANSFER, pad(addr)])]], ["eth_getLogs", [f([TRANSFER, null, pad(addr)])]]); read += to - from + 1; to = from - 1; }
      const res = await rpc(calls); if (res.some((x) => !Array.isArray(x))) break;
      for (const r of res) found.push(...r.filter((l) => l.topics.length === 3));
    }
    return { span: read, logs: found.sort((x, y) => parseInt(y.blockNumber, 16) - parseInt(x.blockNumber, 16) || parseInt(y.logIndex, 16) - parseInt(x.logIndex, 16)).slice(0, 15) };
  }
  async function tokenMeta(addrs) {
    const need = [...new Set(addrs.map((a) => a.toLowerCase()))].filter((a) => !META[a]);
    if (need.length) { const r = await rpc(need.flatMap((a) => [["eth_call", [{ to: a, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: a, data: "0x313ce567" }, "latest"]]])); need.forEach((a, i) => { META[a] = { s: str(r[2 * i]) || "?", d: r[2 * i + 1] && !r[2 * i + 1].error ? parseInt(r[2 * i + 1], 16) : 18 }; }); }
  }
  const META = {};
  const txRows = (logs, self) => logs.map((l) => { const t = META[l.address.toLowerCase()] || { s: "?", d: 18 }, from = "0x" + l.topics[1].slice(26), to = "0x" + l.topics[2].slice(26), out = self && from === self; return `<tr><td>${link(l.transactionHash, l.transactionHash.slice(0, 10) + "…")}</td><td>#${parseInt(l.blockNumber, 16).toLocaleString("en-US")}</td><td>${self ? `<i class="${out ? "out" : "in"}">${out ? "OUT" : "IN"}</i>` : ""} ${link(out ? to : from)}</td><td class="num">${units(big(l.data), t.d)} <span class="dim">${esc(t.s)}</span></td></tr>`; }).join("");

  // ---------- views ----------
  async function showAddress(a) {
    const addr = a.toLowerCase();
    const [code, bal, nonce, head] = await rpc([["eth_getCode", [addr, "latest"]], ["eth_getBalance", [addr, "latest"]], ["eth_getTransactionCount", [addr, "latest"]], ["eth_blockNumber", []]]);
    const isCode = !!code && code !== "0x";
    const bals = await rpc(KNOWN.map((t) => ["eth_call", [{ to: t.a, data: "0x70a08231" + word(addr) }, "latest"]]));
    await tokenMeta(KNOWN.map((t) => t.a));
    const held = KNOWN.map((t, i) => ({ t, v: big(bals[i]) })).filter((x) => x.v > 0n);
    let token = null, sour;
    if (isCode) {
      const r = await rpc([["eth_call", [{ to: addr, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: addr, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: addr, data: "0x18160ddd" }, "latest"]], ["eth_call", [{ to: addr, data: "0x06fdde03" }, "latest"]]]);
      const sym = str(r[0]); if (sym && r[1] && !r[1].error) token = { s: sym, d: parseInt(r[1], 16), supply: big(r[2]), name: str(r[3]) };
      try { const s = await (await fetch(`https://sourcify.dev/server/v2/contract/4663/${addr}`)).json(); sour = s.match || null; } catch { sour = undefined; }
    }
    const [v, word2, why] = verdict({ token: token?.s, dead: addr === DEAD, code: isCode, sourcify: sour, nonce: parseInt(nonce, 16) });
    const kind = addr === DEAD ? "dead address" : token ? `token contract (${token.s})` : isCode ? "contract" : "wallet";
    $("sc-out").innerHTML = `<div class="sc-head2"><div><div class="kick">ADDRESS</div><h2><code>${addr}</code></h2></div><div class="sc-acts"><button class="copy" type="button" data-copy-text="${addr}">Copy</button><a class="btn ghost" href="${EX}/address/${addr}" target="_blank" rel="noopener">Explorer ↗</a></div></div>
      <div class="sc-grid"><div class="sc-panel"><div class="sc-lbl">OVERVIEW</div>${kv("KIND", kind)}${kv("ETH", units(big(bal), 18, 6))}${kv(isCode ? "NONCE" : "TRANSACTIONS SENT", parseInt(nonce, 16).toLocaleString("en-US"))}${isCode ? kv("SOURCIFY", sour ? `verified (${sour.replace("_", " ")})` : sour === null ? "not verified" : "could not be reached") : ""}${token ? kv("TOKEN", `${esc(token.name || token.s)} · ${token.d} decimals`) + kv("SUPPLY", units(token.supply, token.d, 2)) : ""}</div>
      <div class="sc-panel sc-v ${v}"><div class="sc-lbl">SAFE TO PAY? · REINPAY</div><h3>${word2}</h3><p>${why}</p>${v === "stop" ? "" : `<div class="cmd"><pre>reinpay payee check ${addr}\nreinpay payee add "&lt;name&gt;" ${addr}</pre><button class="copy" type="button" data-copy>Copy</button></div>`}<p class="dim" style="font-size:12.5px">The same verdict as <code>reinpay payee check</code>, which also compares it with your own payees for lookalikes.</p></div>
      <div class="sc-panel"><div class="sc-lbl">TOKENS HELD · ${held.length}</div>${held.length ? held.map((x) => kv(esc(x.t.s), units(x.v, META[x.t.a.toLowerCase()]?.d ?? 18))).join("") : '<p class="dim">No USDG, REINPAY or stock tokens.</p>'}</div></div>
      <div class="sc-panel" style="margin-top:14px"><div class="sc-lbl" id="sc-tl">TOKEN TRANSFERS · READING THE CHAIN…</div><div class="sc-tw"><table class="sc-t"><tbody id="sc-tr"></tbody></table></div></div>`;
    const tr = await transfers(addr, parseInt(head, 16)); await tokenMeta(tr.logs.map((l) => l.address));
    $("sc-tl").textContent = `TOKEN TRANSFERS · USDG, REINPAY AND STOCK TOKENS · LAST ${tr.logs.length} IN ${tr.span.toLocaleString("en-US")} BLOCKS`;
    $("sc-tr").innerHTML = tr.logs.length ? txRows(tr.logs, addr) : '<tr><td class="dim">No token transfers in that range.</td></tr>';
  }
  async function showTx(h) {
    const [tx, rc] = await rpc([["eth_getTransactionByHash", [h]], ["eth_getTransactionReceipt", [h]]]);
    if (!tx) throw new Error("No transaction with that hash on Robinhood Chain mainnet.");
    const blk = rc ? await one("eth_getBlockByNumber", [rc.blockNumber, false]) : null;
    const logs = (rc?.logs || []).filter((l) => l.topics[0] === TRANSFER && l.topics.length === 3); await tokenMeta(logs.map((l) => l.address));
    const fee = rc ? big(rc.gasUsed) * big(rc.effectiveGasPrice) : 0n, ok = rc?.status === "0x1";
    $("sc-out").innerHTML = `<div class="sc-head2"><div><div class="kick">TRANSACTION</div><h2><code>${h}</code></h2></div><div class="sc-acts"><span class="sc-st ${rc ? (ok ? "ok" : "stop") : "careful"}">${rc ? (ok ? "SUCCESS" : "FAILED") : "PENDING"}</span><a class="btn ghost" href="${EX}/tx/${h}" target="_blank" rel="noopener">Explorer ↗</a></div></div>
      <div class="sc-grid"><div class="sc-panel"><div class="sc-lbl">OVERVIEW</div>${kv("FROM", link(tx.from))}${kv("TO", tx.to ? link(tx.to) : "contract creation")}${kv("VALUE", units(big(tx.value), 18, 6) + " ETH")}${kv("BLOCK", rc ? `<a href="?q=${parseInt(rc.blockNumber, 16)}" data-q="${parseInt(rc.blockNumber, 16)}">#${parseInt(rc.blockNumber, 16).toLocaleString("en-US")}</a>` : "—")}${kv("TIME", blk ? `${new Date(parseInt(blk.timestamp, 16) * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC · ${ago(parseInt(blk.timestamp, 16))}` : "—")}${kv("FEE", units(fee, 18, 8) + " ETH")}</div>
      <div class="sc-panel" style="grid-column:span 2"><div class="sc-lbl">TOKEN TRANSFERS · ${logs.length}</div><div class="sc-tw"><table class="sc-t"><tbody>${logs.length ? logs.map((l) => { const t = META[l.address.toLowerCase()] || { s: "?", d: 18 }; return `<tr><td>${link("0x" + l.topics[1].slice(26))}</td><td>→</td><td>${link("0x" + l.topics[2].slice(26))}</td><td class="num">${units(big(l.data), t.d)} ${link(l.address, t.s)}</td></tr>`; }).join("") : '<tr><td class="dim">No token transfers in this transaction.</td></tr>'}</tbody></table></div></div></div>`;
  }
  async function showBlock(n) {
    const b = await one("eth_getBlockByNumber", ["0x" + n.toString(16), true]);
    if (!b) throw new Error(`Block ${n.toLocaleString("en-US")} is not on the chain yet.`);
    $("sc-out").innerHTML = `<div class="sc-head2"><div><div class="kick">BLOCK</div><h2>#${n.toLocaleString("en-US")}</h2></div><div class="sc-acts"><a class="btn ghost" href="?q=${n - 1}" data-q="${n - 1}">← ${n - 1}</a><a class="btn ghost" href="?q=${n + 1}" data-q="${n + 1}">${n + 1} →</a><a class="btn ghost" href="${EX}/block/${n}" target="_blank" rel="noopener">Explorer ↗</a></div></div>
      <div class="sc-grid"><div class="sc-panel"><div class="sc-lbl">OVERVIEW</div>${kv("TIME", `${new Date(parseInt(b.timestamp, 16) * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC · ${ago(parseInt(b.timestamp, 16))}`)}${kv("TRANSACTIONS", b.transactions.length)}${kv("GAS USED", big(b.gasUsed).toLocaleString("en-US"))}${kv("HASH", `<code>${short(b.hash)}</code>`)}</div>
      <div class="sc-panel" style="grid-column:span 2"><div class="sc-lbl">TRANSACTIONS · ${b.transactions.length}</div><div class="sc-tw"><table class="sc-t"><tbody>${b.transactions.slice(0, 25).map((t) => `<tr><td>${link(t.hash, t.hash.slice(0, 12) + "…")}</td><td>${link(t.from)}</td><td>→</td><td>${t.to ? link(t.to, BYADDR[t.to.toLowerCase()]?.s) : "create"}</td><td class="num">${units(big(t.value), 18, 6)} ETH</td></tr>`).join("") || '<tr><td class="dim">An empty block.</td></tr>'}</tbody></table></div></div></div>`;
  }
  async function go(q, push = true) {
    q = String(q || "").trim(); if (!q) return;
    $("sc-q").value = q; if (push) history.pushState(null, "", "?q=" + encodeURIComponent(q));
    const out = $("sc-out"); out.innerHTML = '<p class="sc-wait">Reading Robinhood Chain mainnet…</p>'; out.scrollIntoView({ behavior: "smooth", block: "start" });
    busy = true;
    try {
      const sym = KNOWN.find((t) => t.s.toLowerCase() === q.toLowerCase().replace(/^\$/, ""));
      if (sym) await showAddress(sym.a);
      else if (/^0x[0-9a-fA-F]{40}$/.test(q)) await showAddress(q);
      else if (/^0x[0-9a-fA-F]{64}$/.test(q)) await showTx(q.toLowerCase());
      else if (/^#?\d[\d,]*$/.test(q)) await showBlock(Number(q.replace(/[#,]/g, "")));
      else throw new Error("Type an address (0x + 40 characters), a transaction hash (0x + 64), a block number, or a token symbol like USDG or REINPAY.");
    } catch (e) { out.innerHTML = `<p class="sc-err">${esc(e.message)}</p>`; } finally { busy = false; }
    out.querySelectorAll("[data-copy-text]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copyText); b.textContent = "Copied"; } catch { b.textContent = "Select it"; } setTimeout(() => (b.textContent = "Copy"), 1400); }));
    out.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.parentElement.querySelector("pre").textContent); b.textContent = "Copied"; } catch { b.textContent = "Select it"; } setTimeout(() => (b.textContent = "Copy"), 1400); }));
  }
  document.getElementById("sc-form").addEventListener("submit", (e) => { e.preventDefault(); go($("sc-q").value); });
  document.addEventListener("click", (e) => { const a = e.target.closest("[data-q]"); if (a && root.contains(a)) { e.preventDefault(); go(a.dataset.q); } });
  window.addEventListener("popstate", () => { const q = new URLSearchParams(location.search).get("q"); if (q) go(q, false); });
  const q0 = new URLSearchParams(location.search).get("q"); if (q0) go(q0, false);
})();
