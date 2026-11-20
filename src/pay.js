// Payment requests: decide by the rules, simulate on mainnet, keep a receipt, and send only when allowed.
// The agent (MCP) can request and read. Only the owner's terminal can approve, reject, or change rules and payees.
import { encodeFunctionData, erc20Abi, getAddress, isAddress, formatEther, parseEther, createWalletClient } from "viem";
import { publicClient, robinhoodChain, transport, token as tokenOf, TOKENS, BUILTIN, syncTokens, txLink, addrLink, CHAIN_ID } from "./chain.js";
import { loadConfig, saveConfig } from "./config.js";
import { decide, findPayee, parseAmount, totals, limit, fmt, dailyLimit, activeGrants, localDay } from "./rules.js";

const maxZero = (v) => (v > 0n ? v : 0n);
import { allReceipts, addReceipt, updateReceipt, getReceipt, view } from "./receipts.js";
import { simulate, mismatch } from "./simulate.js";
import { walletAddress, loadAccount, isUnlocked } from "./keystore.js";
import { withLock } from "./lock.js";
import { notifyOwner } from "./notify.js";
import { checkSeal } from "./seal.js";
import { usdValue } from "./price.js";
import { search } from "./search.js";
import { needsCosign, checkCosign } from "./cosign.js";
import { findLookalike, LookalikeError } from "./lookalike.js";
import { frozen, freeze, tripped, breakerOf } from "./freeze.js";

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
/** Pure: is this network fee above the owner's max fee? Returns a reason or null. */
export function feeTooHigh(rules, feeWei) {
  const m = rules?.maxFeeEth;
  if (m == null || m === "") return null;
  const cap = parseEther(String(m));
  return feeWei > cap ? `the network fee would be about ${formatEther(feeWei)} ETH, above your max fee of ${m} ETH` : null;
}

async function check(from, symbol, payeeAddress, amountRaw, rules = null) {
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
  const tooHigh = feeTooHigh(rules, feeWei);
  if (tooHigh) return { problem: tooHigh, rule: "network fee", tx, sim, feeWei };
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
  // Fail closed: if the chain cannot be read (rate limit, timeout), say so instead of treating the address as "not a token".
  const unreachable = (e) => /HTTP request failed|Too Many|429|fetch failed|timed? ?out|ECONN|socket|network/i.test(String(e?.shortMessage || "") + " " + String(e?.message || "") + " " + String(e?.details || ""));
  let code;
  try { code = await c.getCode({ address: a }); }
  catch (e) { throw new Error(`Could not read ${a} from Robinhood Chain (${e?.shortMessage || e?.message}). Nothing was changed; try again in a minute.`); }
  let out = null;
  if (code && code !== "0x") {
    const [dec, sup, sym] = await Promise.allSettled([
      c.readContract({ address: a, abi: erc20Abi, functionName: "decimals" }),
      c.readContract({ address: a, abi: erc20Abi, functionName: "totalSupply" }),
      c.readContract({ address: a, abi: erc20Abi, functionName: "symbol" }),
    ]);
    for (const r of [dec, sup]) if (r.status === "rejected" && unreachable(r.reason)) throw new Error(`Could not check whether ${a} is a token: Robinhood Chain did not answer (${r.reason?.shortMessage || r.reason?.message}). Nothing was changed; try again in a minute.`);
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
const usdRules = (rules) => !!rules?.usd && (rules.usd.max != null || rules.usd.daily != null);
async function usdFor(cfg, symbol, amountRaw) {
  if (!usdRules(cfg.rules)) return {};
  const u = await usdValue(symbol, amountRaw).catch((e) => ({ value: null, reason: e.message }));
  return u.value === null ? { usdReason: u.reason } : { usdRaw: u.value.toString(), ethPrice: symbol === "ETH" ? u.price : undefined };
}

export async function requestPayment({ payee, amount, token = "USDG", memo = "" }, { by = "agent", session = null } = {}) {
  const from = requireWallet();
  const cfg = loadConfig();
  syncTokens(cfg);
  const symbol = tokenOf(token).symbol;
  const amountRaw = parseAmount(amount, symbol);
  const p = findPayee(cfg.payees, payee);
  const tokenPayee = p && p.isContract !== false ? await tokenAt(p.address) : null;
  const base = { by, wallet: from, chainId: CHAIN_ID, payee: p ? p.name : String(payee ?? ""), payeeAddress: p ? p.address : null,
    ...(session ? { session: session.id } : {}), ...(p?.category ? { category: p.category } : {}), token: symbol, tokenAddress: TOKENS[symbol].address, amount: fmt(amountRaw, symbol).split(" ")[0], amountRaw: amountRaw.toString(), memo: String(memo).slice(0, 200) };
  // Decide, simulate and write the receipt as one step, so a second request cannot spend the same budget in between.
  // Once the receipt exists it counts against today's budget (waiting or sending), so signing can happen outside the lock.
  const fz = frozen();
  if (fz) return view(addReceipt({ ...base, status: "blocked", rule: "frozen", reason: `Reinpay is frozen (${fz.reason}). Nothing is paid until the owner runs reinpay unfreeze.` }));
  const usd = await usdFor(cfg, symbol, amountRaw);
  if (usd.usdRaw) { base.usdRaw = usd.usdRaw; base.usdValue = fmt(BigInt(usd.usdRaw), "USDG").split(" ")[0]; if (usd.ethPrice) base.ethPriceUsdg = usd.ethPrice.toFixed(2); }
  const r = tokenPayee ? addReceipt({ ...base, status: "blocked", rule: "token contract", reason: `${p.name} (${p.address}) is the contract of ${tokenPayee}. Tokens sent to a token contract are usually stuck for good. Ask the owner to fix this payee.` }) : await withLock(async () => {
    expireStale(cfg.rules);
    const d = decide({ rules: cfg.rules, receipts: allReceipts(), request: { payee: p, token: symbol, amountRaw, memo, usdRaw: usd.usdRaw, usdReason: usd.usdReason, session } });
    if (d.status === "blocked") return addReceipt({ ...base, status: "blocked", rule: d.rule, reason: d.reason });
    const ch = await check(from, symbol, p.address, amountRaw, cfg.rules);
    if (ch.problem) return addReceipt({ ...base, status: "blocked", rule: ch.rule || "simulation", reason: `Simulated on mainnet: ${ch.problem}.`, simulation: simView(ch.sim) });
    const status = d.status === "needs_approval" ? "needs_approval" : cfg.rules.autoSend && isUnlocked() ? "sending" : "ready";
    const reason = status === "ready" ? `${d.reason} Waiting for the owner because autoSend is ${cfg.rules.autoSend ? "on but the wallet is locked" : "off"}.` : d.reason;
    const rec = addReceipt({ ...base, status, rule: d.rule, reason, simulation: simView(ch.sim, ch.feeWei) });
    if (status === "sending") rec._tx = ch.tx; // kept in memory only, never written to disk
    return rec;
  });
  if (cfg.notify?.alertAt && ["needs_approval", "ready", "sending"].includes(r.status)) await budgetAlert(cfg, symbol).catch(() => null);
  if (r.status === "blocked" && by === "agent") {
    const t = tripped(allReceipts(), cfg.rules);
    if (t && !frozen()) {
      const f = freeze({ by: "breaker", reason: `circuit breaker: the agent was blocked ${t.count} times in ${t.minutes} minutes (${t.ids.slice(-5).join(", ")})` });
      let note = `Circuit breaker: Reinpay is now frozen (${f.reason}).`;
      if (cfg.notify) { const n = await notifyOwner(r, { cfg, event: "frozen", text: `Reinpay froze itself: ${f.reason}.\nNothing will be paid until you check reinpay receipts and run reinpay unfreeze in your terminal.` }); note += n.ok ? ` Owner notified (${n.detail}).` : ` Owner notification failed (${n.detail}).`; }
      return view(updateReceipt(r.id, {}, note));
    }
  }
  if (r.status === "sending") {
    const fz2 = frozen();
    if (fz2) return view(updateReceipt(r.id, { status: "needs_approval", rule: "frozen", reason: `Not sent: Reinpay was frozen (${fz2.reason}).` }, "Autosend stopped: frozen."));
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

/** Tell the owner once a day per token when today's budget passes their alert line (notify.alertAt, a percent). */
export async function budgetAlert(cfg, symbol, { now = Date.now(), fetch: f } = {}) {
  const pct = Number(cfg.notify?.alertAt || 0);
  const daily = dailyLimit(cfg.rules, symbol, now);
  if (!pct || !daily) return null;
  const { spent, held } = totals(allReceipts(), symbol, now);
  if ((spent + held) * 100n < daily * BigInt(pct)) return null;
  const { existsSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { HOME, writePrivate } = await import("./config.js");
  const file = join(HOME(), "alerts.json"), day = localDay(now);
  let seen = {}; try { if (existsSync(file)) seen = JSON.parse(readFileSync(file, "utf8")); } catch { seen = {}; }
  if (seen[day]?.[symbol]) return null;
  seen = { [day]: { ...(seen[day] || {}), [symbol]: true } };
  writePrivate(file, JSON.stringify(seen) + "\n");
  const used = Number(((spent + held) * 1000n) / daily) / 10;
  const text = `Reinpay: ${used}% of today's ${symbol} budget is used (sent ${fmt(spent, symbol)}, waiting ${fmt(held, symbol)} of ${fmt(daily, symbol)}).\nNew payments in ${symbol} are blocked once it is full.`;
  return notifyOwner({ id: "BUDGET", token: symbol, status: "alert" }, { cfg, text, event: "budget_alert", ...(f ? { fetch: f } : {}) });
}

/**
 * Dry run, for the agent and the owner: what would happen to this payment right now? The rules are checked and, if they
 * would let it through or ask the owner, the payment is simulated on mainnet. No receipt is written, nothing counts
 * against any budget, nothing is signed, and the circuit breaker does not see it.
 */
export async function previewPayment({ payee, amount, token = "USDG", memo, explain: wantSteps = false }) {
  const from = requireWallet();
  const cfg = loadConfig();
  syncTokens(cfg);
  const symbol = tokenOf(token).symbol;
  const amountRaw = parseAmount(amount, symbol);
  const p = findPayee(cfg.payees, payee);
  let steps = null; // filled when the caller asked for the explanation (reinpay check --explain)
  const out = (wouldBe, rule, reason, extra = {}) => ({ dryRun: true, payee: p ? p.name : String(payee ?? ""), token: symbol, amount: fmt(amountRaw, symbol).split(" ")[0], wouldBe, rule, reason, ...extra, ...(wantSteps ? { steps: steps || [{ rule, state: "block", detail: reason, decided: true, reached: true }] } : {}), note: "Nothing was recorded or signed. Call request_payment to actually ask." });
  const fz = frozen();
  if (fz) return out("blocked", "frozen", `Reinpay is frozen (${fz.reason}).`);
  if (p && p.isContract !== false) { const tok = await tokenAt(p.address); if (tok) return out("blocked", "token contract", `${p.name} is the contract of ${tok}.`); }
  const usd = await usdFor(cfg, symbol, amountRaw);
  const dArgs = { rules: memo === undefined ? { ...cfg.rules, memoMin: 0 } : cfg.rules, receipts: allReceipts(), request: { payee: p, token: symbol, amountRaw, memo, usdRaw: usd.usdRaw, usdReason: usd.usdReason } };
  const d = decide(dArgs);
  if (wantSteps) steps = (await import("./explain.js")).explain(dArgs).steps;
  if (d.status === "blocked") return out("blocked", d.rule, d.reason);
  const ch = await check(from, symbol, p.address, amountRaw, cfg.rules);
  if (steps) { // the mainnet simulation runs after the rules; it only counts when the rules let the payment through
    const blk = ch.problem ? { rule: ch.rule || "simulation", state: "block", detail: ch.problem } : { rule: "simulation", state: "pass", detail: `one transfer out, at block ${ch.sim.block}${ch.feeWei != null ? `, fee about ${formatEther(ch.feeWei)} ETH` : ""}` };
    steps = [...steps.map((x) => (ch.problem ? { ...x, decided: false } : x)), { ...blk, decided: !!ch.problem, reached: true }];
  }
  if (ch.problem) return out("blocked", ch.rule || "simulation", `Simulated on mainnet: ${ch.problem}.`, { simulation: simView(ch.sim) });
  const wouldBe = d.status === "needs_approval" ? "needs_approval" : cfg.rules.autoSend && isUnlocked() ? "sent" : "ready";
  return out(wouldBe, d.rule, wouldBe === "ready" ? `${d.reason} It would wait for the owner because autoSend is ${cfg.rules.autoSend ? "on but the wallet is locked" : "off"}.` : d.reason, { simulation: simView(ch.sim, ch.feeWei) });
}

/**
 * reinpay check --plan: a list of payments, checked in order as if the agent asked for all of them now. Each one sees the
 * ones before it (as waiting payments), so budgets, the repeat guard and the per-hour cap add up the way they would for real.
 * Payments the rules let through are simulated on mainnet one by one. Nothing is recorded, nothing is signed.
 */
export const PLAN_MAX = 50;
export async function previewPlan(items, { _check = check } = {}) { // _check: tests only, to run offline
  if (!Array.isArray(items) || items.length === 0) throw new Error("The plan must be a JSON list of payments: [{\"payee\": \"Weather API\", \"amount\": \"0.0005\", \"token\": \"ETH\"}, ...]");
  if (items.length > PLAN_MAX) throw new Error(`A plan can hold at most ${PLAN_MAX} payments.`);
  const from = requireWallet();
  const cfg = loadConfig();
  syncTokens(cfg);
  const fz = frozen();
  const now = Date.now(), real = allReceipts(), planned = [], out = [];
  for (const [i, it] of items.entries()) {
    const n = i + 1, memo = it?.memo === undefined ? undefined : String(it.memo);
    const row = (wouldBe, rule, reason, extra = {}) => { const r = { n, payee: String(it?.payee ?? ""), amount: String(it?.amount ?? ""), token: String(it?.token || "USDG"), wouldBe, rule, reason, ...extra }; out.push(r); return r; };
    let symbol, amountRaw, p;
    try { symbol = tokenOf(String(it?.token || "USDG")).symbol; amountRaw = parseAmount(String(it?.amount ?? ""), symbol); }
    catch (e) { row("blocked", "amount", e.message); continue; }
    p = findPayee(cfg.payees, String(it?.payee ?? ""));
    if (fz) { row("blocked", "frozen", `Reinpay is frozen (${fz.reason}).`); continue; }
    if (p && p.isContract !== false) { const tok = await tokenAt(p.address); if (tok) { row("blocked", "token contract", `${p.name} is the contract of ${tok}.`); continue; } }
    const usd = await usdFor(cfg, symbol, amountRaw);
    const d = decide({ rules: memo === undefined ? { ...cfg.rules, memoMin: 0 } : cfg.rules, receipts: [...real, ...planned], request: { payee: p, token: symbol, amountRaw, memo, usdRaw: usd.usdRaw, usdReason: usd.usdReason }, now });
    if (d.status === "blocked") { row("blocked", d.rule, d.reason); continue; }
    const ch = await _check(from, symbol, p.address, amountRaw, cfg.rules);
    if (ch.problem) { row("blocked", ch.rule || "simulation", `Simulated on mainnet: ${ch.problem}.`, { simulation: simView(ch.sim) }); continue; }
    const wouldBe = d.status === "needs_approval" ? "needs_approval" : "ready";
    row(wouldBe, d.rule, d.reason, { payee: p.name, amount: fmt(amountRaw, symbol).split(" ")[0], token: symbol, simulation: simView(ch.sim, ch.feeWei) });
    // From here on the next payments see this one as waiting, the way a real request would count.
    planned.push({ id: `plan line ${n}`, payeeAddress: p.address, token: symbol, amountRaw: amountRaw.toString(), createdAt: now, status: wouldBe, ...(p.category ? { category: p.category } : {}), ...(usd.usdRaw ? { usdRaw: usd.usdRaw } : {}) });
  }
  const count = (w) => out.filter((r) => r.wouldBe === w).length;
  const totals = {};
  for (const r of out) if (r.wouldBe !== "blocked") totals[r.token] = (totals[r.token] ?? 0n) + parseAmount(r.amount, r.token);
  return { dryRun: true, payments: out, summary: { ready: count("ready"), needsApproval: count("needs_approval"), blocked: count("blocked"), wouldGoThrough: Object.fromEntries(Object.entries(totals).map(([t, v]) => [t, fmt(v, t)])) },
    note: "Each payment was checked as if the ones before it were waiting. Payments that pass the rules were simulated on mainnet one at a time, from today's balance, not one after another. Nothing was recorded or signed." };
}

/** Waiting payments older than rules.expireAfterMinutes become "expired", so they stop holding today's budget. */
export function expireStale(rules, now = Date.now()) {
  const m = Number(rules?.expireAfterMinutes || 0);
  if (!m) return 0;
  let n = 0;
  for (const r of allReceipts()) if (["needs_approval", "ready"].includes(r.status) && now - r.createdAt > m * 60_000) { updateReceipt(r.id, { status: "expired" }, `Expired: waited more than ${m} minutes for the owner.`); n++; }
  return n;
}

/** Owner only (terminal): approve a waiting payment. Rules and the simulation are checked again first. */
export async function approve(id, { passphrase, cosig } = {}) {
  expireStale(loadConfig().rules);
  const pre = getReceipt(id);
  if (!pre) throw new Error(`No receipt ${id}.`);
  if (!["needs_approval", "ready"].includes(pre.status)) throw new Error(`${pre.id} is ${pre.status}; only waiting payments can be approved.`);
  // Two-person approval is checked first, before the chain is read or the key is opened.
  let cosignOk = false;
  { const cfg0 = loadConfig();
    if (needsCosign(cfg0.rules, pre.token, pre.amountRaw)) {
      const cs = await checkCosign(cfg0.rules, pre, cosig);
      if (!cs.ok) throw new Error(`Not signed: ${cs.reason}.`);
      cosignOk = true;
      updateReceipt(pre.id, { cosignedBy: getAddress(cfg0.rules.cosign.by) }, `Co-signed (${cs.reason}).`);
    } }
  // The account is opened before the lock, so a wrong passphrase fails before anything changes.
  const fz = frozen();
  if (fz) throw new Error(`Reinpay is frozen (${fz.reason}). Check reinpay receipts, then run reinpay unfreeze before approving.`);
  const account = loadAccount(passphrase);
  const done = await withLock(async () => {
    const r = getReceipt(id);
    if (!r) throw new Error(`No receipt ${id}.`);
    if (!["needs_approval", "ready"].includes(r.status)) throw new Error(`${r.id} is ${r.status}; only waiting payments can be approved.`);
    const cfg = loadConfig();
    const p = findPayee(cfg.payees, r.payeeAddress);
    if (!p || getAddress(p.address) !== getAddress(r.payeeAddress || "0x0000000000000000000000000000000000000000")) return { final: updateReceipt(r.id, { status: "blocked", rule: "payee list", reason: "This payee is no longer on your payee list." }, "Approval refused: payee not on the list.") };
    const usd = await usdFor(cfg, r.token, BigInt(r.amountRaw));
    const d = decide({ rules: { ...cfg.rules, repeatGuardMinutes: 0, approveAbove: {}, memoMin: 0 }, receipts: allReceipts(), request: { payee: p, token: r.token, amountRaw: BigInt(r.amountRaw), usdRaw: usd.usdRaw, usdReason: usd.usdReason }, excludeId: r.id });
    if (d.status === "blocked") return { final: updateReceipt(r.id, { status: "blocked", rule: d.rule, reason: d.reason }, `Approval refused: ${d.reason}`) };
    // Build the transaction fresh from the payee list and the amount, simulate exactly that, and sign exactly that.
    const ch = await check(r.wallet, r.token, getAddress(p.address), BigInt(r.amountRaw), cfg.rules);
    if (ch.problem) return { final: updateReceipt(r.id, { status: "blocked", rule: ch.rule || "simulation", reason: `Simulated again: ${ch.problem}.` }, "Approval refused by the second simulation.") };
    if (needsCosign(cfg.rules, r.token, r.amountRaw) && !cosignOk) throw new Error("Not signed: the co-signature was not checked."); // checked before the lock
    const sc = await checkSeal(cfg, r.wallet);
    if (!sc.ok) return { final: updateReceipt(r.id, { rule: "config seal", reason: `Not signed: ${sc.reason}. Check reinpay rules, then run reinpay seal and approve again.` }, "Approval stopped: config not sealed.") };
    return { go: updateReceipt(r.id, { status: "sending", simulation: simView(ch.sim, ch.feeWei) }, "Approved by the owner; simulated again."), tx: ch.tx };
  });
  if (done.final) return view(done.final);
  return view(await sendNow(done.go, done.tx, account));
}

/**
 * reinpay approve --dry: everything approve checks, in the same order, read fresh now, and then it stops before the key
 * is opened. Nothing is recorded, nothing changes on the receipt, nothing is signed.
 */
export async function approvePreview(id, now = Date.now(), { _check = check } = {}) { // _check: tests only
  const r = getReceipt(id);
  if (!r) throw new Error(`No receipt ${id}.`);
  const cfg = loadConfig();
  syncTokens(cfg);
  const steps = [], add = (rule, ok, detail) => { steps.push({ rule, ok, detail }); return ok; };
  const out = (wouldSign) => ({ dryRun: true, id: r.id, payee: r.payee, amount: r.amount, token: r.token, wouldSign, steps, note: "Nothing was recorded, changed or signed." });
  if (!add("waiting", ["needs_approval", "ready"].includes(r.status), r.status === "needs_approval" ? `waits for you (${r.rule})` : r.status === "ready" ? "ready, waits for you" : `${r.status}, not waiting`)) return out(false);
  const m = Number(cfg.rules.expireAfterMinutes || 0);
  if (m && !add("not expired", now - r.createdAt <= m * 60_000, `waiting ${Math.round((now - r.createdAt) / 60000)} of ${m} minutes`)) return out(false);
  if (needsCosign(cfg.rules, r.token, r.amountRaw)) add("co-sign", true, `needs a signature from ${cfg.rules.cosign.by} too: approve with --cosig=0x…`);
  const fz = frozen();
  if (!add("not frozen", !fz, fz ? `frozen: ${fz.reason}` : "not frozen")) return out(false);
  const p = findPayee(cfg.payees, r.payeeAddress);
  if (!add("payee list", !!p && getAddress(p.address) === getAddress(r.payeeAddress || "0x0000000000000000000000000000000000000000"), p ? `${p.name} is still on your list` : "this payee is no longer on your list")) return out(false);
  const usd = await usdFor(cfg, r.token, BigInt(r.amountRaw));
  const d = decide({ rules: { ...cfg.rules, repeatGuardMinutes: 0, approveAbove: {}, memoMin: 0 }, receipts: allReceipts(), request: { payee: p, token: r.token, amountRaw: BigInt(r.amountRaw), usdRaw: usd.usdRaw, usdReason: usd.usdReason }, excludeId: r.id, now });
  if (!add("rules now", d.status !== "blocked", d.status === "blocked" ? `${d.rule}: ${d.reason}` : "inside every rule now (the approval line and repeat guard are what you are answering)")) return out(false);
  const ch = await _check(r.wallet, r.token, getAddress(p.address), BigInt(r.amountRaw), cfg.rules);
  if (!add("simulation now", !ch.problem, ch.problem ? ch.problem : `one transfer out, at block ${ch.sim.block}${ch.feeWei != null ? `, fee about ${formatEther(ch.feeWei)} ETH` : ""}`)) return out(false);
  const sc = await checkSeal(cfg, r.wallet);
  if (!add("config seal", sc.ok, sc.reason)) return out(false);
  return out(true);
}

export function reject(id, why = "Rejected by the owner.") {
  const r = getReceipt(id);
  if (!r) throw new Error(`No receipt ${id}.`);
  if (!["needs_approval", "ready"].includes(r.status)) throw new Error(`${r.id} is ${r.status}; only waiting payments can be rejected.`);
  return view(updateReceipt(r.id, { status: "rejected" }, why));
}

export function listReceipts({ status, limit: n = 20, ...filters } = {}) {
  try { expireStale(loadConfig().rules); } catch { /* reading receipts never fails because of this */ }
  syncTokens();
  const list = search(allReceipts(), { status, ...filters }).slice().reverse();
  return list.slice(0, Math.min(Math.max(Number(n) || 20, 1), 200)).map(view);
}

export function rulesView(now = Date.now()) {
  const cfg = loadConfig();
  syncTokens(cfg);
  const per = {};
  for (const s of Object.keys(TOKENS)) {
    const daily = dailyLimit(cfg.rules, s, now);
    const grants = activeGrants(cfg.rules, s, now);
    const { spent, held } = totals(allReceipts(), s, now);
    per[s] = {
      dailyBudget: daily === null ? null : fmt(daily, s), ...(grants.length ? { includesGrants: grants.map((g) => ({ amount: fmt(g.amountRaw, s), until: g.until, note: g.note })) } : {}), sentToday: fmt(spent, s), waitingToday: fmt(held, s),
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
    frozen: frozen(), circuitBreaker: breakerOf(cfg.rules) ? `freezes after ${breakerOf(cfg.rules).count} blocked requests in ${breakerOf(cfg.rules).minutes} minutes` : "off",
    firstPaymentNeedsOwner: cfg.rules.firstPayment === "ask",
    ...(cfg.rules.maxFeeEth ? { maxNetworkFee: `${cfg.rules.maxFeeEth} ETH` } : {}),
    ...(cfg.rules.cosign?.by ? { coSign: { by: cfg.rules.cosign.by, above: cfg.rules.cosign.above } } : {}),
    ...(cfg.rules.requireProven ? { unprovenPayeesNeedOwner: true } : {}),
    ...(usdRules(cfg.rules) ? { usdRules: { ...(cfg.rules.usd.max != null ? { maxPerPayment: `${cfg.rules.usd.max} USD` } : {}), ...(cfg.rules.usd.daily != null ? { dailyAcrossTokens: `${cfg.rules.usd.daily} USD` } : {}), priceSource: "two WETH/USDG pools on Robinhood Chain; payments in other tokens are blocked while USD rules are on" } } : {}),
    ...(cfg.rules.memoMin ? { memoRequired: `at least ${cfg.rules.memoMin} characters saying what the payment is for` } : {}),
    ...(cfg.rules.expireAfterMinutes ? { waitingPaymentsExpireAfterMinutes: Number(cfg.rules.expireAfterMinutes) } : {}),
    ...(cfg.schedules?.length ? { scheduledPayments: cfg.schedules.map((x) => ({ id: x.id, payee: x.payee, amount: `${x.amount} ${x.token}`, every: x.every, starts: x.start, ...(x.paused ? { paused: true } : {}) })) } : {}),
    ...(cfg.rules.maxPerHour ? { maxPaymentsPerHour: Number(cfg.rules.maxPerHour) } : {}),
    ...(cfg.rules.hours ? { paymentHours: `${cfg.rules.hours.from}:00-${cfg.rules.hours.to}:00 local${cfg.rules.hours.weekdays ? ", weekdays only" : ""}; outside them payments wait for the owner` } : {}),
    ...(cfg.rules.categories ? { categoryBudgets: Object.fromEntries(Object.entries(cfg.rules.categories).map(([c, v]) => [c, Object.fromEntries(Object.entries(v.daily || {}).map(([t, a]) => [t, `${a} ${t} a day`]))])) } : {}),
    tokens: per, repeatGuardMinutes: cfg.rules.repeatGuardMinutes, autoSend: !!cfg.rules.autoSend, walletUnlocked: isUnlocked(),
    ownerNotifiedBy: cfg.notify?.type || null,
    payees: cfg.payees.filter((p) => !p.disabled && !(p.expiresAt && Date.parse(p.expiresAt) <= now)).map((p) => {
      const tokens = p.tokens || Object.keys(TOKENS);
      const lim = {};
      for (const t of tokens) {
        const d = p.daily?.[t], m = p.maxPerPayment?.[t];
        if (d == null && m == null) continue;
        const { spent, held } = totals(allReceipts(), t, now, p.address);
        lim[t] = { ...(m != null ? { maxPerPayment: `${m} ${t}` } : {}), ...(d != null ? { dailyBudget: `${d} ${t}`, leftToday: fmt(maxZero(parseAmount(String(d), t) - spent - held), t) } : {}) };
      }
      return { name: p.name, address: p.address, tokens, note: p.note || null, ...(p.proof ? { provedAt: p.proof.at } : {}), ...(p.category ? { category: p.category } : {}), ...(p.expiresAt ? { expiresAt: p.expiresAt } : {}), ...(Object.keys(lim).length ? { limits: lim } : {}) };
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

/** reinpay today: the owner's one-screen summary. The balances are read from the chain; if that fails, the rest still shows. */
export async function todayView(now = Date.now()) {
  const a = requireWallet();
  const cfg = loadConfig();
  syncTokens(cfg);
  expireStale(cfg.rules, now);
  let b = null, balanceError = null;
  try { b = await balances(a); } catch (e) { balanceError = e?.shortMessage || e?.message || "unreachable"; }
  const S = await import("./schedule.js"), st = S.loadState();
  const { today } = await import("./today.js");
  const out = today({ cfg, receipts: allReceipts(), balances: b, frozen: frozen(), schedules: cfg.schedules || [], nextOf: (x) => S.nextOf(x, st), now });
  if (balanceError) out.lines.splice(out.lines.findIndex((l) => l.includes("█ sent")) + 1, 0, `  Wallet: could not read balances from Robinhood Chain (${balanceError}).`);
  return out;
}

// ---- payees (owner only, from the CLI) ----
export async function addPayee({ name, address, tokens, note, maxPerPayment, allowLookalike = false, untilMs = null }) {
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
  const like = findLookalike(a, [...cfg.payees, ...(walletAddress() ? [{ name: "your own wallet", address: walletAddress() }] : [])]);
  if (like && !allowLookalike) throw new LookalikeError(a, like);
  const tok = await tokenAt(a); // throws if the chain cannot be read
  const code = await publicClient().getCode({ address: a });
  if (tok) throw new Error(`${a} is the contract of ${tok}, not a wallet. Tokens sent to a token contract are usually stuck for good. Use the recipient's own address.`);
  const p = { name, address: a, ...(tokens ? { tokens } : {}), ...(note ? { note } : {}), ...(maxPerPayment ? { maxPerPayment } : {}), isContract: !!code && code !== "0x", ...(like ? { lookalikeConfirmed: like.name } : {}), ...(untilMs ? { expiresAt: new Date(Date.now() + untilMs).toISOString() } : {}), addedAt: new Date().toISOString() };
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

/** reinpay payee check: read an address from Robinhood Chain before it becomes a payee. Read-only. */
export async function checkPayeeAddress(address, { fetch: f } = {}) {
  if (!isAddress(String(address || ""))) throw new Error(`"${address}" is not a valid 0x address.`);
  const a = getAddress(address), cfg = loadConfig();
  syncTokens(cfg);
  const c = publicClient();
  let me = null; try { me = requireWallet(); } catch {}
  const [code, nonce, bal] = await Promise.all([c.getCode({ address: a }), c.getTransactionCount({ address: a }), balances(a)]);
  const hasCode = !!code && code !== "0x";
  const token = hasCode ? await tokenAt(a) : null;
  let sourcify; if (hasCode && !token) { try { sourcify = await sourcifyMatch(a, f); } catch { sourcify = undefined; } }
  const { findLookalike } = await import("./lookalike.js"), { payeeVerdict } = await import("./payeecheck.js");
  const known = [...cfg.payees, ...(me ? [{ name: "your wallet", address: me }] : [])];
  const onList = cfg.payees.find((p) => getAddress(p.address) === a)?.name || null;
  const facts = { address: a, own: me ? getAddress(me) === a : false, onList, lookalike: findLookalike(a, known), code: hasCode, token, sourcify, nonce,
    balances: Object.fromEntries(["ETH", "USDG"].map((t) => [t, fmt(bal[t] ?? 0n, t).split(" ")[0]])) };
  return { ...facts, ...payeeVerdict(facts) };
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
