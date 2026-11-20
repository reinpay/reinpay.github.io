// reinpay.app/terminal: a terminal in the browser. Chain commands read Robinhood Chain mainnet with plain JSON-RPC;
// `check` runs Reinpay's own rules engine (assets/check, the same files as the wallet). Nothing is signed or sent.
import { decide, findPayee, parseAmount } from "./check/rules.js";
import { ROWS, WEATHER, GPU, USDG } from "./check/labcore.js";

const root = document.getElementById("term");
if (root) {
  const RPC = "https://rpc.mainnet.chain.robinhood.com", EX = "https://robinhoodchain.blockscout.com";
  const CA = root.dataset.ca, A = root.dataset.assets, TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const out = document.getElementById("term-out"), inp = document.getElementById("term-in"), form = document.getElementById("term-form");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const line = (t = "", cls = "") => { const d = document.createElement("div"); d.className = "tl " + cls; d.innerHTML = t; out.appendChild(d); out.scrollTop = out.scrollHeight; return d; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let rid = 0;
  async function rpc(calls) {
    const out2 = [];
    for (let i = 0; i < calls.length; i += 40) {
      const body = calls.slice(i, i + 40).map(([m, p]) => ({ jsonrpc: "2.0", id: ++rid, method: m, params: p }));
      let j = null;
      for (let k = 1; k <= 4 && !j; k++) { try { const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (r.ok) j = await r.json(); else await sleep(800 * k); } catch { await sleep(900 * k); } }
      if (!j) throw new Error("Robinhood Chain could not be reached. Try again in a moment.");
      const by = Object.fromEntries((Array.isArray(j) ? j : [j]).map((x) => [x.id, x]));
      out2.push(...body.map((b) => (by[b.id]?.error ? null : by[b.id]?.result ?? null)));
    }
    return out2;
  }
  const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
  const units = (v, d, max = 4) => { const s = v.toString().padStart(d + 1, "0"), i = s.slice(0, s.length - d), f = s.slice(s.length - d).replace(/0+$/, "").slice(0, max); return BigInt(i).toLocaleString("en-US") + (f ? "." + f : ""); };
  const word = (a) => a.slice(2).toLowerCase().padStart(64, "0");
  const str = (h) => { try { if (!h || h === "0x") return null; const b = h.slice(2), len = parseInt(b.slice(64, 128), 16); return decodeURIComponent(b.slice(128, 128 + len * 2).replace(/../g, "%$&")); } catch { return null; } };
  const ago = (ts) => { const s = Math.max(0, Math.round(Date.now() / 1000 - ts)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
  const json = (p) => fetch(A + p + "?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const kv = (k, v, c = "") => line(`  <span class="tk">${k.padEnd(14, " ").replace(/ /g, "&nbsp;")}</span><span class="${c}">${v}</span>`);
  const PAYEES = [{ name: "Weather API", address: WEATHER, isContract: false }, { name: "GPU credits", address: GPU, isContract: false }];
  let receipts = [];

  const HELP = [
    ["help", "this list"],
    ["status", "latest block, block time and gas price, read now"],
    ["burns", "every REINPAY burn, with its transaction"],
    ["supply", "burned, outside the dead address, holders"],
    ["lab", "the latest Reinpay Lab run: what each rule set stopped"],
    ["scan <0xaddress>", "kind, balances, and whether it is safe to pay"],
    ["tx <0xhash>", "a transaction: status, value, token transfers"],
    ["block <number>", "a block: time and transactions"],
    ["check <payee> <amount> [ETH|USDG]", "Reinpay's real rules decide a pretend payment"],
    ["rules [default|balanced|cautious|hardened|none]", "the rule set that check uses (default: default)"],
    ["payees", "the example payees check knows"],
    ["ca", "the official REINPAY contract"],
    ["private", "private payments: the concept"],
    ["clear", "clear the screen"],
  ];
  let rulesSet = "default";
  const C = {
    help() { line("Commands:", "tg"); for (const [c, d] of HELP) line(`  <span class="tc">${esc(c).padEnd(48, " ").replace(/ /g, "&nbsp;")}</span><span class="dim">${esc(d)}</span>`); line("Tip: ↑ ↓ for history, Tab to complete. Every number is read live; nothing is signed.", "dim"); },
    clear() { out.innerHTML = ""; },
    ca() { line(`REINPAY · Robinhood Chain mainnet · chain id 4663`, "tg"); kv("contract", `<a href="${EX}/token/${CA}" target="_blank" rel="noopener">${CA}</a>`); line("This is the only official contract.", "dim"); },
    private() { line("Private payment intelligence · concept preview", "tg"); line("Shield, pay inside your rules, prove the funds are clean. In development: nothing is live, no deposits.", "dim"); line(`More: <a href="../private/">reinpay.app/private</a>`); },
    payees() { line("Example payees (check uses these):", "tg"); for (const p of PAYEES) kv(p.name, p.address); line("Anything else is not on the list and is blocked.", "dim"); },
    async status() { const [h, gp] = await rpc([["eth_blockNumber", []], ["eth_gasPrice", []]]); const n = parseInt(h, 16); const [b0, b5] = await rpc([["eth_getBlockByNumber", ["0x" + n.toString(16), false]], ["eth_getBlockByNumber", ["0x" + (n - 20).toString(16), false]]]); line("Robinhood Chain mainnet", "tg"); kv("latest block", n.toLocaleString("en-US"), "tg"); kv("block time", ((parseInt(b0.timestamp, 16) - parseInt(b5.timestamp, 16)) / 20).toFixed(2) + " s"); kv("gas price", (Number(big(gp)) / 1e9).toFixed(4) + " gwei"); kv("transactions", `${b0.transactions.length} in the latest block`); },
    async burns() { const D = await json("chain/stats.json"); if (!D) throw new Error("The burn record could not be read."); line(`${D.burns.length} burns · ${units(BigInt(D.burned), 18, 2)} REINPAY · ${D.burnedPct.toFixed(2)}% of supply`, "tg"); for (const b of D.burns) line(`  #${String(b.n).padEnd(3, " ").replace(/ /g, "&nbsp;")} ${b.time.slice(0, 10)}  ${units(BigInt(b.amount), 18, 2).padStart(16, " ").replace(/ /g, "&nbsp;")}  <a href="${EX}/tx/${b.tx}" target="_blank" rel="noopener">${b.tx.slice(0, 12)}…</a>`); line(`read at block ${D.block.toLocaleString("en-US")}`, "dim"); },
    async supply() { const D = await json("chain/stats.json"); if (!D) throw new Error("The record could not be read."); kv("total supply", units(BigInt(D.totalSupply), 18, 0)); kv("burned", `${units(BigInt(D.burned), 18, 2)} (${D.burnedPct.toFixed(2)}%)`, "tg"); kv("outside dead", units(BigInt(D.circulating), 18, 0)); kv("holders", `${D.holders} (wallets, pools and contracts)`); kv("checked", D.logsMatchContract ? "dead balance = sum of burn logs ✓" : "see the explorer"); },
    async lab() { const L = await json("lab/latest.json"); if (!L) throw new Error("The lab run could not be read."); const n = L.attacks.length; line(`Reinpay Lab · run at block ${Number(L.block).toLocaleString("en-US")} · ${n} scams`, "tg"); for (const r of L.rows) { const cs = L.cells.filter((c) => c.row === r.id), st = cs.filter((c) => c.outcome !== "paid" && c.outcome !== "void").length; line(`  ${r.label.padEnd(10, " ").replace(/ /g, "&nbsp;")} <span class="${st === n ? "tg" : st >= n - 2 ? "ty" : "tr"}">${"█".repeat(st)}${"░".repeat(n - st)}</span> stopped ${st} of ${n}`); } line("Throwaway wallets, real rules, real mainnet simulations. Nothing signed.", "dim"); },
    async scan(a) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(a || "")) throw new Error("Usage: scan <0xaddress>");
      const addr = a.toLowerCase();
      const [code, bal, nonce, u, r] = await rpc([["eth_getCode", [addr, "latest"]], ["eth_getBalance", [addr, "latest"]], ["eth_getTransactionCount", [addr, "latest"]], ["eth_call", [{ to: USDG, data: "0x70a08231" + word(addr) }, "latest"]], ["eth_call", [{ to: CA, data: "0x70a08231" + word(addr) }, "latest"]]]);
      const isCode = !!code && code !== "0x"; let tok = null, sour;
      if (isCode) { const [s] = await rpc([["eth_call", [{ to: addr, data: "0x95d89b41" }, "latest"]]]); tok = str(s); try { sour = (await (await fetch(`https://sourcify.dev/server/v2/contract/4663/${addr}`)).json()).match || null; } catch { sour = undefined; } }
      const dead = addr === "0x000000000000000000000000000000000000dead", nn = parseInt(nonce, 16);
      kv("address", addr); kv("kind", dead ? "dead address" : tok ? `token contract (${esc(tok)})` : isCode ? "contract" : "wallet"); kv("ETH", units(big(bal), 18, 6)); kv("USDG", units(big(u), 6)); kv("REINPAY", units(big(r), 18, 2)); kv(isCode ? "nonce" : "sent", nn.toLocaleString("en-US")); if (isCode) kv("sourcify", sour ? "verified" : sour === null ? "not verified" : "unreachable");
      const [v, why] = tok ? ["tr", `DO NOT PAY · the ${tok} token contract: tokens sent here are usually stuck`] : dead ? ["tr", "DO NOT PAY · the dead address burns anything sent to it"] : isCode && !sour ? ["ty", "BE CAREFUL · a contract nobody can read on Sourcify"] : isCode ? ["ty", "BE CAREFUL · a verified contract: check it takes plain transfers"] : nn === 0 ? ["ty", "BE CAREFUL · a fresh address with no history"] : ["tg", "LOOKS FINE · a wallet with a history. Still confirm it with the payee"];
      line(`  ${why}`, v); if (v !== "tr") line(`  next: reinpay payee check ${addr}`, "dim");
    },
    async tx(h) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(h || "")) throw new Error("Usage: tx <0xhash>");
      const [t, rc] = await rpc([["eth_getTransactionByHash", [h]], ["eth_getTransactionReceipt", [h]]]); if (!t) throw new Error("No such transaction on Robinhood Chain mainnet.");
      kv("status", rc ? (rc.status === "0x1" ? "SUCCESS" : "FAILED") : "PENDING", rc?.status === "0x1" ? "tg" : "tr"); kv("from", t.from); kv("to", t.to || "contract creation"); kv("value", units(big(t.value), 18, 6) + " ETH"); if (rc) { kv("block", parseInt(rc.blockNumber, 16).toLocaleString("en-US")); kv("fee", units(big(rc.gasUsed) * big(rc.effectiveGasPrice), 18, 8) + " ETH"); }
      const logs = (rc?.logs || []).filter((l) => l.topics[0] === TRANSFER && l.topics.length === 3);
      if (logs.length) { const meta = await rpc(logs.flatMap((l) => [["eth_call", [{ to: l.address, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: l.address, data: "0x313ce567" }, "latest"]]])); line("  token transfers:", "tk"); logs.forEach((l, i) => line(`    ${("0x" + l.topics[1].slice(26)).slice(0, 10)}… → ${("0x" + l.topics[2].slice(26)).slice(0, 10)}…  ${units(big(l.data), meta[2 * i + 1] ? parseInt(meta[2 * i + 1], 16) : 18)} ${esc(str(meta[2 * i]) || "?")}`)); }
      line(`  <a href="${EX}/tx/${h}" target="_blank" rel="noopener">open in the explorer ↗</a>`, "dim");
    },
    async block(n) {
      if (!/^\d+$/.test((n || "").replace(/,/g, ""))) throw new Error("Usage: block <number>");
      const k = Number(n.replace(/,/g, "")), [b] = await rpc([["eth_getBlockByNumber", ["0x" + k.toString(16), false]]]); if (!b) throw new Error("That block is not on the chain yet.");
      kv("block", k.toLocaleString("en-US")); kv("time", `${new Date(parseInt(b.timestamp, 16) * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC · ${ago(parseInt(b.timestamp, 16))}`); kv("transactions", b.transactions.length); kv("gas used", big(b.gasUsed).toLocaleString("en-US")); kv("hash", b.hash.slice(0, 18) + "…");
    },
    rules(set) {
      if (set) { if (!ROWS[set]) throw new Error("Rule sets: default, balanced, cautious, hardened, none."); rulesSet = set; receipts = []; }
      const r = ROWS[rulesSet]; line(`Rule set: ${r.label} · ${r.about}`, "tg");
      for (const [k, v] of Object.entries(r.rules)) if (v !== undefined) kv(k, esc(typeof v === "object" ? JSON.stringify(v) : String(v)));
      line("check uses this set. Payments you check count against it, like a real day.", "dim");
    },
    check(...a) {
      const tokIdx = a.findIndex((x) => /^(eth|usdg)$/i.test(x)), token = tokIdx >= 0 ? a.splice(tokIdx, 1)[0].toUpperCase() : "ETH";
      const amount = a.pop(), payee = a.join(" ").replace(/^["']|["']$/g, "");
      if (!payee || !amount) throw new Error('Usage: check <payee> <amount> [ETH|USDG]   e.g. check "Weather API" 0.0005');
      const rules = Object.fromEntries(Object.entries(ROWS[rulesSet].rules).filter(([, v]) => v !== undefined));
      const p = findPayee(PAYEES, payee); let amountRaw; try { amountRaw = parseAmount(amount, token); } catch (e) { throw new Error(e.message); }
      const now = Date.now() + receipts.length, d = decide({ rules, receipts, request: { payee: p, token, amountRaw, memo: "terminal check", balanceRaw: 10n ** 18n }, now });
      const W = { allowed: ["tg", "WITHIN RULES · would be simulated on mainnet, then sent or wait for you"], needs_approval: ["ty", "WAITS FOR YOU"], blocked: ["tr", "BLOCKED"] }[d.status];
      line(`  ${amount} ${token} → ${esc(p ? p.name : payee)} · rules: ${ROWS[rulesSet].label}`);
      line(`  ${W[1]}${d.rule && d.status !== "allowed" ? ` · ${d.rule}` : ""}`, W[0]); if (d.reason) line(`  ${esc(d.reason)}`, "dim");
      if (p && d.status !== "blocked") receipts.push({ id: "RP-" + receipts.length, payeeAddress: p.address, token, amountRaw: amountRaw.toString(), createdAt: now, status: d.status === "allowed" ? "ready" : d.status });
      line("  Decided by Reinpay's own rules engine, in this page. Nothing signed.", "dim");
    },
  };
  const names = Object.keys(C);
  const hist = []; let hi = 0;
  async function run(cmd, echo = true) {
    const raw = cmd.trim(); if (!raw) return;
    if (echo) line(`<span class="tp">reinpay@intelligence:~$</span> ${esc(raw)}`);
    hist.push(raw); hi = hist.length;
    const parts = raw.match(/"[^"]*"|\S+/g).map((x) => x.replace(/^"|"$/g, "")), name = parts.shift().toLowerCase().replace(/^reinpay$/, "help");
    if (!C[name]) { line(`command not found: ${esc(name)}. Type help.`, "tr"); return; }
    inp.disabled = true; const wait = name.match(/^(status|burns|supply|lab|scan|tx|block)$/) ? line("  reading Robinhood Chain mainnet…", "dim") : null;
    try { await C[name](...parts); } catch (e) { line(`  ${esc(e.message)}`, "tr"); } finally { wait?.remove(); inp.disabled = false; inp.focus({ preventScroll: true }); line(""); }
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); const v = inp.value; inp.value = ""; run(v); });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") { e.preventDefault(); if (hi > 0) inp.value = hist[--hi]; }
    else if (e.key === "ArrowDown") { e.preventDefault(); inp.value = hi < hist.length - 1 ? hist[++hi] : (hi = hist.length, ""); }
    else if (e.key === "Tab") { e.preventDefault(); const m = names.filter((n) => n.startsWith(inp.value.trim().toLowerCase())); if (m.length === 1) inp.value = m[0] + " "; else if (m.length) line(m.join("  "), "dim"); }
  });
  document.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => { run(b.dataset.cmd); inp.focus({ preventScroll: true }); }));
  root.querySelector(".term-win").addEventListener("click", (e) => { if (!e.target.closest("a,button")) inp.focus({ preventScroll: true }); });
  (async () => { line("Reinpay Intelligence · terminal · Robinhood Chain mainnet", "tg"); line("Type help, or pick a command below. Every answer is read live; nothing is signed.", "dim"); line(""); await run("status"); })();
}
