// Payment requests: decide by the rules, simulate on mainnet, keep a receipt, and send only when allowed.
// The agent (MCP) can request and read. Only the owner's terminal can approve, reject, or change rules and payees.
import { encodeFunctionData, erc20Abi, getAddress, isAddress, formatEther, createWalletClient } from "viem";
import { publicClient, robinhoodChain, transport, token as tokenOf, TOKENS, BUILTIN, syncTokens, txLink, addrLink, CHAIN_ID } from "./chain.js";
import { loadConfig, saveConfig } from "./config.js";
import { decide, findPayee, parseAmount, totals, limit, fmt } from "./rules.js";

const maxZero = (v) => (v > 0n ? v : 0n);
import { allReceipts, addReceipt, updateReceipt, getReceipt, view } from "./receipts.js";
import { simulate, mismatch } from "./simulate.js";
import { walletAddress, loadAccount, isUnlocked } from "./keystore.js";
import { withLock } from "./lock.js";
import { notifyOwner } from "./notify.js";
import { checkSeal } from "./seal.js";

const FEE_MARGIN = 12n; // tenths: 1.2x the simulated gas

export function requireWallet() {
  const a = walletAddress();
  if (!a) throw new Error("No Reinpay wallet on this computer yet. The owner runs `reinpay init` in their own terminal.");
  return a;
}

export function buildTx(symbol, to, amountRaw) {
  const t = TOKENS[symbol];
  return t.address
    ? { to: t.address, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amountRaw] }) }
    : { to, value: amountRaw, data: "0x" };
}

async function balances(address) {
  const c = publicClient();
  const list = Object.values(TOKENS);
  const vals = await Promise.all(list.map((t) => (t.address ? c.readContract({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [address] }) : c.getBalance({ address }))));
  return Object.fromEntries(list.map((t, i) => [t.symbol, vals[i]]));
}

/** Simulate the payment and check the wallet can pay it plus the network fee. Returns { problem, sim, feeWei }. */
async function check(from, symbol, payeeAddress, amountRaw) {
  const c = publicClient();
  const tx = buildTx(symbol, payeeAddress, amountRaw);
  const [bal, gasPrice] = await Promise.all([balances(from), c.getGasPrice()]);
  if (bal[symbol] < amountRaw) return { problem: `the wallet holds ${fmt(bal[symbol], symbol)}, less than ${fmt(amountRaw, symbol)}`, tx };
  const sim = await simulate(from, tx);
  const bad = mismatch(sim, { tokenAddress: TOKENS[symbol].address, to: payeeAddress, amount: amountRaw });
  if (bad) return { problem: bad, tx, sim };
  const feeWei = (sim.gasUsed * FEE_MARGIN * gasPrice) / 10n;
  const ethNeeded = feeWei + (symbol === "ETH" ? amountRaw : 0n);
  if (bal.ETH < ethNeeded) return { problem: `the wallet holds ${formatEther(bal.ETH)} ETH, not enough for the network fee of about ${formatEther(feeWei)} ETH${symbol === "ETH" ? " on top of the payment" : ""}`, tx, sim };
  return { problem: null, tx, sim, feeWei };
}

/**
 * Does this address answer like an ERC-20 token (decimals and totalSupply both readable)? Tokens sent to a token's own
 * contract are almost always stuck for good, so such an address is never a payee. Returns its symbol (or "a token"), or null.
 */
const tokenCache = new Map();
export async function tokenAt(address) {
  const a = getAddress(address);
  if (tokenCache.has(a)) return tokenCache.get(a);
  const c = publicClient();
  const code = await c.getCode({ address: a }).catch(() => null);
  let out = null;
  if (code && code !== "0x") {
    const [dec, sup, sym] = await Promise.allSettled([
      c.readContract({ address: a, abi: erc20Abi, functionName: "decimals" }),
      c.readContract({ address: a, abi: erc20Abi, functionName: "totalSupply" }),
      c.readContract({ address: a, abi: erc20Abi, functionName: "symbol" }),
    ]);
    if (dec.status === "fulfilled" && sup.status === "fulfilled") out = sym.status === "fulfilled" && /^[\x20-\x7e]{1,20}$/.test(sym.value) ? sym.value : "a token";
  }
  tokenCache.set(a, out);
  return out;
}

const simView = (s, feeWei) => s && { ok: s.ok, block: s.block.toString(), gasUsed: s.gasUsed.toString(), estimatedFeeEth: feeWei != null ? formatEther(feeWei) : null, method: "eth_simulateV1" };

// Signs only the transaction it is handed: one built a moment ago from the payee list and the amount, and the same one
// that was just simulated. Nothing is ever read back from receipts.json to be signed.
async function sendNow(r, tx, account) {
  if (getAddress(account.address) !== getAddress(r.wallet)) throw new Error("The keystore address changed since this payment was requested. Request it again.");
  updateReceipt(r.id, { status: "sending" }, "Signing and sending.");
  const w = createWalletClient({ account, chain: robinhoodChain, transport: transport() });
  let hash;
  try {
    hash = await w.sendTransaction({ to: tx.to, data: tx.data, value: BigInt(tx.value) });
  } catch (e) {
    return updateReceipt(r.id, { status: "failed" }, `Not sent: ${e.shortMessage || e.message}`);
  }
  updateReceipt(r.id, { txHash: hash, explorer: txLink(hash) }, `Sent ${hash}.`);
  const rc = await publicClient().waitForTransactionReceipt({ hash, timeout: 120_000 }).catch(() => null);
  if (!rc) return updateReceipt(r.id, { status: "sending" }, "Sent, but no receipt within 2 minutes. Check the explorer link.");
  const fee = rc.gasUsed * rc.effectiveGasPrice;
  return updateReceipt(r.id, { status: rc.status === "success" ? "sent" : "failed", block: rc.blockNumber.toString(), networkFeeEth: formatEther(fee) },
    rc.status === "success" ? `Confirmed in block ${rc.blockNumber}.` : `Reverted in block ${rc.blockNumber}. Nothing was paid; the network fee was.`);
}

/** The agent's way to pay. Never signs unless the payment is inside every rule AND the owner turned on autoSend AND unlocked. */
export async function requestPayment({ payee, amount, token = "USDG", memo = "" }, { by = "agent" } = {}) {
  const from = requireWallet();
  const cfg = loadConfig();
  syncTokens(cfg);
  const symbol = tokenOf(token).symbol;
  const amountRaw = parseAmount(amount, symbol);
  const p = findPayee(cfg.payees, payee);
  const tokenPayee = p && p.isContract !== false ? await tokenAt(p.address) : null;
  const base = { by, wallet: from, chainId: CHAIN_ID, payee: p ? p.name : String(payee ?? ""), payeeAddress: p ? p.address : null,
    token: symbol, amount: fmt(amountRaw, symbol).split(" ")[0], amountRaw: amountRaw.toString(), memo: String(memo).slice(0, 200) };
  // Decide, simulate and write the receipt as one step, so a second request cannot spend the same budget in between.
  // Once the receipt exists it counts against today's budget (waiting or sending), so signing can happen outside the lock.
  if (tokenPayee) return view(addReceipt({ ...base, status: "blocked", rule: "token contract", reason: `${p.name} (${p.address}) is the contract of ${tokenPayee}. Tokens sent to a token contract are usually stuck for good. Ask the owner to fix this payee.` }));
  const r = await withLock(async () => {
    const d = decide({ rules: cfg.rules, receipts: allReceipts(), request: { payee: p, token: symbol, amountRaw } });
    if (d.status === "blocked") return addReceipt({ ...base, status: "blocked", rule: d.rule, reason: d.reason });
    const ch = await check(from, symbol, p.address, amountRaw);
    if (ch.problem) return addReceipt({ ...base, status: "blocked", rule: "simulation", reason: `Simulated on mainnet: ${ch.problem}.`, simulation: simView(ch.sim) });
    const status = d.status === "needs_approval" ? "needs_approval" : cfg.rules.autoSend && isUnlocked() ? "sending" : "ready";
    const reason = status === "ready" ? `${d.reason} Waiting for the owner because autoSend is ${cfg.rules.autoSend ? "on but the wallet is locked" : "off"}.` : d.reason;
    const rec = addReceipt({ ...base, status, rule: d.rule, reason, simulation: simView(ch.sim, ch.feeWei) });
    if (status === "sending") rec._tx = ch.tx; // kept in memory only, never written to disk
    return rec;
  });
  if (r.status === "sending") {
    const sc = await checkSeal(loadConfig(), from);
    if (!sc.ok) return view(updateReceipt(r.id, { status: "needs_approval", rule: "config seal", reason: `Not sent: ${sc.reason}. The owner checks the rules and runs reinpay seal.` }, "Autosend stopped: config not sealed."));
    return view(await sendNow(r, r._tx, loadAccount()));
  }
  if (["needs_approval", "ready"].includes(r.status) && cfg.notify) {
    const n = await notifyOwner(r, { cfg });
    return view(updateReceipt(r.id, {}, n.ok ? `Owner notified (${n.detail}).` : `Owner notification failed (${n.detail}).`));
  }
  return view(r);
}

/** Owner only (terminal): approve a waiting payment. Rules and the simulation are checked again first. */
export async function approve(id, { passphrase } = {}) {
  const pre = getReceipt(id);
  if (!pre) throw new Error(`No receipt ${id}.`);
  if (!["needs_approval", "ready"].includes(pre.status)) throw new Error(`${pre.id} is ${pre.status}; only waiting payments can be approved.`);
  // The account is opened before the lock, so a wrong passphrase fails before anything changes.
  const account = loadAccount(passphrase);
  const done = await withLock(async () => {
    const r = getReceipt(id);
    if (!r) throw new Error(`No receipt ${id}.`);
    if (!["needs_approval", "ready"].includes(r.status)) throw new Error(`${r.id} is ${r.status}; only waiting payments can be approved.`);
    const cfg = loadConfig();
    const p = findPayee(cfg.payees, r.payeeAddress);
    if (!p || getAddress(p.address) !== getAddress(r.payeeAddress || "0x0000000000000000000000000000000000000000")) return { final: updateReceipt(r.id, { status: "blocked", rule: "payee list", reason: "This payee is no longer on your payee list." }, "Approval refused: payee not on the list.") };
    const d = decide({ rules: { ...cfg.rules, repeatGuardMinutes: 0, approveAbove: {} }, receipts: allReceipts(), request: { payee: p, token: r.token, amountRaw: BigInt(r.amountRaw) }, excludeId: r.id });
    if (d.status === "blocked") return { final: updateReceipt(r.id, { status: "blocked", rule: d.rule, reason: d.reason }, `Approval refused: ${d.reason}`) };
    // Build the transaction fresh from the payee list and the amount, simulate exactly that, and sign exactly that.
    const ch = await check(r.wallet, r.token, getAddress(p.address), BigInt(r.amountRaw));
    if (ch.problem) return { final: updateReceipt(r.id, { status: "blocked", rule: "simulation", reason: `Simulated again: ${ch.problem}.` }, "Approval refused by the second simulation.") };
    const sc = await checkSeal(cfg, r.wallet);
    if (!sc.ok) return { final: updateReceipt(r.id, { rule: "config seal", reason: `Not signed: ${sc.reason}. Check reinpay rules, then run reinpay seal and approve again.` }, "Approval stopped: config not sealed.") };
    return { go: updateReceipt(r.id, { status: "sending", simulation: simView(ch.sim, ch.feeWei) }, "Approved by the owner; simulated again."), tx: ch.tx };
  });
  if (done.final) return view(done.final);
  return view(await sendNow(done.go, done.tx, account));
}

export function reject(id, why = "Rejected by the owner.") {
  const r = getReceipt(id);
  if (!r) throw new Error(`No receipt ${id}.`);
  if (!["needs_approval", "ready"].includes(r.status)) throw new Error(`${r.id} is ${r.status}; only waiting payments can be rejected.`);
  return view(updateReceipt(r.id, { status: "rejected" }, why));
}

export function listReceipts({ status, limit: n = 20 } = {}) {
  let list = allReceipts().slice().reverse();
  if (status) list = list.filter((r) => r.status === status);
  return list.slice(0, Math.min(Math.max(Number(n) || 20, 1), 200)).map(view);
}

export function rulesView(now = Date.now()) {
  const cfg = loadConfig();
  syncTokens(cfg);
  const per = {};
  for (const s of Object.keys(TOKENS)) {
    const daily = limit(cfg.rules, "daily", s);
    const { spent, held } = totals(allReceipts(), s, now);
    per[s] = {
      dailyBudget: daily === null ? null : fmt(daily, s), sentToday: fmt(spent, s), waitingToday: fmt(held, s),
      leftToday: daily === null ? null : fmt(daily > spent + held ? daily - spent - held : 0n, s),
      maxPerPayment: cfg.rules.maxPerPayment?.[s] != null ? fmt(limit(cfg.rules, "maxPerPayment", s), s) : null,
      ...Object.fromEntries([["weekly", "week"], ["monthly", "month"]].flatMap(([k, period]) => {
        const cap = limit(cfg.rules, k, s);
        if (cap === null) return [];
        const t = totals(allReceipts(), s, now, null, period);
        return [[`${k}Budget`, { budget: fmt(cap, s), sent: fmt(t.spent, s), waiting: fmt(t.held, s), left: fmt(maxZero(cap - t.spent - t.held), s) }]];
      })),
      ownerApprovesAbove: cfg.rules.approveAbove?.[s] != null ? fmt(limit(cfg.rules, "approveAbove", s), s) : null,
    };
  }
  return {
    tokens: per, repeatGuardMinutes: cfg.rules.repeatGuardMinutes, autoSend: !!cfg.rules.autoSend, walletUnlocked: isUnlocked(),
    ownerNotifiedBy: cfg.notify?.type || null,
    payees: cfg.payees.filter((p) => !p.disabled).map((p) => {
      const tokens = p.tokens || Object.keys(TOKENS);
      const lim = {};
      for (const t of tokens) {
        const d = p.daily?.[t], m = p.maxPerPayment?.[t];
        if (d == null && m == null) continue;
        const { spent, held } = totals(allReceipts(), t, now, p.address);
        lim[t] = { ...(m != null ? { maxPerPayment: `${m} ${t}` } : {}), ...(d != null ? { dailyBudget: `${d} ${t}`, leftToday: fmt(maxZero(parseAmount(String(d), t) - spent - held), t) } : {}) };
      }
      return { name: p.name, address: p.address, tokens, note: p.note || null, ...(Object.keys(lim).length ? { limits: lim } : {}) };
    }),
    note: "Only the owner can change rules or payees, and only in their own terminal. Payments that need approval wait for `reinpay approve`.",
  };
}

export async function sealStatus() { return checkSeal(loadConfig(), walletAddress()); }

export async function walletStatus() {
  const a = requireWallet();
  syncTokens();
  const b = await balances(a);
  return { address: a, chainId: CHAIN_ID, explorer: addrLink(a), balances: Object.fromEntries(Object.entries(b).map(([s, v]) => [s, fmt(v, s).split(" ")[0]])), ...rulesView() };
}

// ---- payees (owner only, from the CLI) ----
export async function addPayee({ name, address, tokens, note, maxPerPayment }) {
  syncTokens();
  if (tokens) for (const t of tokens) if (!TOKENS[t]) throw new Error(`Unknown token "${t}". Reinpay spends ${Object.keys(TOKENS).join(", ")}; add others with reinpay token add.`);
  if (!/^[\w .'-]{2,40}$/.test(String(name || ""))) throw new Error("Payee name: 2-40 letters, digits, spaces, dots, dashes or apostrophes.");
  if (!isAddress(String(address || ""))) throw new Error(`"${address}" is not a valid 0x address.`);
  const a = getAddress(address);
  if (/^0x0{40}$/i.test(a)) throw new Error("Refusing the zero address.");
  const known = Object.values(TOKENS).find((t) => t.address && t.address === a);
  if (known) throw new Error(`${a} is the contract of ${known.symbol}, not a wallet. Tokens sent to a token contract are usually stuck for good. Use the recipient's own address.`);
  const cfg = loadConfig();
  if (cfg.payees.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new Error(`A payee named "${name}" already exists.`);
  if (cfg.payees.some((p) => getAddress(p.address) === a)) throw new Error(`${a} is already on the list.`);
  const code = await publicClient().getCode({ address: a }).catch(() => null);
  const tok = code && code !== "0x" ? await tokenAt(a) : null;
  if (tok) throw new Error(`${a} is the contract of ${tok}, not a wallet. Tokens sent to a token contract are usually stuck for good. Use the recipient's own address.`);
  const p = { name, address: a, ...(tokens ? { tokens } : {}), ...(note ? { note } : {}), ...(maxPerPayment ? { maxPerPayment } : {}), isContract: !!code && code !== "0x", addedAt: new Date().toISOString() };
  cfg.payees.push(p);
  saveConfig(cfg);
  return p;
}

export function setPayee(name, patch) {
  const cfg = loadConfig();
  const p = findPayee(cfg.payees, name);
  if (!p) throw new Error(`No payee "${name}".`);
  Object.assign(p, patch);
  saveConfig(cfg);
  return p;
}

/** Owner only: set or clear a payee's own daily budget or max per payment for one token. amount "off" clears it. */
export function setPayeeLimit(name, kind, token, amount) {
  const key = { daily: "daily", max: "maxPerPayment" }[kind];
  const sym = String(token || "").toUpperCase();
  syncTokens();
  if (!key || !TOKENS[sym]) throw new Error(`Usage: reinpay payee limit <name> <daily|max> <${Object.keys(TOKENS).join("|")}> <amount|off>`);
  const cfg = loadConfig();
  const p = findPayee(cfg.payees, name);
  if (!p) throw new Error(`No payee "${name}".`);
  if (p.tokens && !p.tokens.includes(sym)) throw new Error(`${p.name} may only be paid in ${p.tokens.join(" or ")}.`);
  if (String(amount).toLowerCase() === "off") {
    if (p[key]) { delete p[key][sym]; if (!Object.keys(p[key]).length) delete p[key]; }
  } else {
    parseAmount(amount, sym);
    p[key] = { ...(p[key] || {}), [sym]: String(amount) };
  }
  saveConfig(cfg);
  return p;
}

// ---- extra tokens (owner only, from the CLI) ----
const SOURCIFY = "https://sourcify.dev/server/v2/contract";

/** Sourcify's verdict for a contract on Robinhood Chain: "exact_match", "match" or null. `f` is for tests. */
export async function sourcifyMatch(address, f = globalThis.fetch) {
  const res = await f(`${SOURCIFY}/${CHAIN_ID}/${getAddress(address)}`, { headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sourcify answered ${res.status}; try again later.`);
  const j = await res.json();
  return ["exact_match", "match"].includes(j.match) ? j.match : null;
}

/** Add an ERC-20 on Robinhood Chain. It must have code, answer like a token, and be verified on Sourcify. Spending stays off until the owner sets a daily budget for it. */
export async function addToken(address, { fetch: f } = {}) {
  if (!isAddress(String(address || ""))) throw new Error(`"${address}" is not a valid 0x address.`);
  const a = getAddress(address);
  const c = publicClient();
  const code = await c.getCode({ address: a });
  if (!code || code === "0x") throw new Error(`${a} has no contract code on Robinhood Chain mainnet.`);
  const [sym, dec, name] = await Promise.all(["symbol", "decimals", "name"].map((fn) => c.readContract({ address: a, abi: erc20Abi, functionName: fn }).catch(() => null)));
  if (sym == null || dec == null) throw new Error(`${a} does not answer like an ERC-20 token (symbol and decimals).`);
  const symbol = String(sym).toUpperCase();
  if (!/^[A-Z0-9]{1,11}$/.test(symbol)) throw new Error(`The token's symbol "${sym}" is not plain letters and digits; Reinpay will not guess a name for it.`);
  if (!(Number(dec) >= 0 && Number(dec) <= 36)) throw new Error(`Unusual decimals (${dec}); refused.`);
  syncTokens();
  if (TOKENS[symbol]) throw new Error(`${symbol} is already a token Reinpay spends${TOKENS[symbol].address && TOKENS[symbol].address !== a ? ` (at ${TOKENS[symbol].address}). Two tokens with one symbol would be confusing; refused` : ""}.`);
  const match = await sourcifyMatch(a, f);
  if (!match) throw new Error(`${a} (${symbol}) is not verified on Sourcify for chain ${CHAIN_ID}. Reinpay only adds tokens whose source code is published and matched.`);
  const cfg = loadConfig();
  const t = { symbol, address: a, decimals: Number(dec), name: name ? String(name).slice(0, 60) : symbol, sourcify: match, addedAt: new Date().toISOString() };
  cfg.tokens = [...(cfg.tokens || []).filter((x) => x.symbol !== symbol), t];
  saveConfig(cfg);
  syncTokens(cfg);
  return t;
}

export function removeToken(symbol) {
  const s = String(symbol || "").toUpperCase();
  if (BUILTIN.includes(s)) throw new Error(`${s} is built in and cannot be removed. Set its daily budget to 0 to stop spending it.`);
  const cfg = loadConfig();
  if (!(cfg.tokens || []).some((t) => t.symbol === s)) throw new Error(`No added token ${s}.`);
  cfg.tokens = cfg.tokens.filter((t) => t.symbol !== s);
  saveConfig(cfg);
  syncTokens(cfg);
  return s;
}

export function removePayee(name) {
  const cfg = loadConfig();
  const p = findPayee(cfg.payees, name);
  if (!p) throw new Error(`No payee "${name}".`);
  cfg.payees = cfg.payees.filter((x) => x !== p);
  saveConfig(cfg);
  return p;
}
