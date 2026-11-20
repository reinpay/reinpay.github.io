// reinpay doctor: one read-only checkup of this computer's Reinpay setup. Nothing is signed, nothing is changed.
// Each check is ok, warn (works, but worth a look) or fail (payments will not work until fixed), with what to do next.
import { formatEther, getAddress } from "viem";
import { publicClient, CHAIN_ID, rpcUrl, TOKENS, syncTokens } from "./chain.js";
import { loadConfig } from "./config.js";
import { keystoreExists, walletAddress, isUnlocked, unlockedUntil } from "./keystore.js";
import { checkSeal } from "./seal.js";
import { lookalikePairs, looksLike } from "./lookalike.js";
import { frozen, breakerOf } from "./freeze.js";

export const MIN_NODE = [22, 12];
const TRANSFER_GAS = 80_000n; // a little above a plain ERC-20 transfer
export const FEW_PAYMENTS = 10n;

export function nodeOk(v = process.versions.node) {
  const [a, b] = v.split(".").map(Number);
  return a > MIN_NODE[0] || (a === MIN_NODE[0] && b >= MIN_NODE[1]);
}

/** Pure part: rules and payees. Returns checks for the config alone. */
export function configChecks(cfg, wallet) {
  const out = [];
  const payees = (cfg.payees || []).filter((p) => !p.disabled);
  const all = cfg.payees || [];
  const confirmed = new Set(all.filter((p) => p.lookalikeConfirmed).map((p) => p.name));
  const pairsAll = lookalikePairs(all);
  const pairs = pairsAll.filter(([a, b]) => !confirmed.has(a) && !confirmed.has(b));
  const okPairs = pairsAll.filter(([a, b]) => confirmed.has(a) || confirmed.has(b));
  const self = wallet ? all.filter((p) => !p.lookalikeConfirmed && ( looksLike(p.address, wallet) || getAddress(p.address) === getAddress(wallet))) : [];
  if (!cfg.payees?.length) out.push({ name: "payees", level: "warn", detail: "no payees yet, so every request is blocked", fix: 'reinpay payee add "Name" 0xAddress' });
  else if (pairs.length || self.length) out.push({ name: "payees", level: "fail", detail: [...pairs.map(([a, b]) => `${a} and ${b} start and end alike`), ...self.map((p) => `${p.name} looks like your own wallet`)].join("; "), fix: "check those addresses with the payee, then remove the wrong one: reinpay payee remove <name>" });
  else if (okPairs.length) out.push({ name: "payees", level: "warn", detail: okPairs.map(([a, b]) => `${a} and ${b} start and end alike (you confirmed this when adding)`).join("; "), fix: "double-check with the payee before large payments" });
  else out.push({ name: "payees", level: payees.length ? "ok" : "warn", detail: payees.length ? `${payees.length} active, no lookalike addresses` : "every payee is switched off", fix: payees.length ? null : "reinpay payee on <name>" });
  syncTokens(cfg);
  const used = new Set(payees.flatMap((p) => p.tokens || Object.keys(TOKENS)));
  const noBudget = [...used].filter((t) => TOKENS[t] && (cfg.rules?.daily?.[t] === undefined || cfg.rules?.daily?.[t] === null || cfg.rules?.daily?.[t] === ""));
  out.push(noBudget.length
    ? { name: "daily budgets", level: "warn", detail: `no daily budget for ${noBudget.join(", ")}, so payments in it are blocked`, fix: `reinpay rule daily ${noBudget[0]} <amount>` }
    : { name: "daily budgets", level: "ok", detail: Object.entries(cfg.rules?.daily || {}).map(([k, v]) => `${v} ${k}`).join(", ") || "none needed yet" });
  return out;
}

/** The whole checkup. `client` and `now` are for tests. */
export async function doctor({ client = publicClient(), now = Date.now() } = {}) {
  const out = [];
  const push = (name, level, detail, fix = null) => out.push({ name, level, detail, fix });
  push("node", nodeOk() ? "ok" : "fail", `Node.js ${process.versions.node}`, nodeOk() ? null : `install Node.js ${MIN_NODE.join(".")} or newer from nodejs.org`);
  const wallet = keystoreExists() ? walletAddress() : null;
  push("wallet", wallet ? "ok" : "fail", wallet || "no wallet on this computer", wallet ? null : "reinpay init");
  let chainId = null, gasPrice = null;
  try { [chainId, gasPrice] = await Promise.all([client.getChainId(), client.getGasPrice()]); push("rpc", "ok", rpcUrl()); }
  catch (e) { push("rpc", "fail", `${rpcUrl()} did not answer (${e.shortMessage || e.message})`, "check your internet connection, or set rpc in config.json back to null"); }
  if (chainId !== null) push("chain", chainId === CHAIN_ID ? "ok" : "fail", `chain id ${chainId}`, chainId === CHAIN_ID ? null : `this RPC is not Robinhood Chain mainnet (${CHAIN_ID}); set rpc in config.json back to null`);
  let cfg = null;
  try { cfg = loadConfig(); } catch (e) { push("config", "fail", e.message, "fix or move config.json"); }
  if (cfg && wallet) {
    const s = await checkSeal(cfg, wallet);
    push("config seal", s.ok ? "ok" : "fail", s.reason, s.ok ? null : "check reinpay rules, then reinpay seal");
  }
  if (wallet) {
    const until = unlockedUntil();
    const unlocked = isUnlocked(now);
    const auto = !!cfg?.rules?.autoSend;
    if (!unlocked) push("unlock", auto ? "warn" : "ok", auto ? "locked, so autosend cannot send anything" : "locked: payments wait for reinpay approve", auto ? "reinpay unlock --for=2h, or reinpay autosend off" : null);
    else push("unlock", until ? "ok" : "warn", until ? `unlocked until ${new Date(until).toISOString()}` : "unlocked with no end time", until ? null : "reinpay lock, then reinpay unlock --for=12h");
  }
  if (wallet && gasPrice !== null) {
    try {
      const bal = await client.getBalance({ address: wallet });
      const fee = TRANSFER_GAS * gasPrice;
      const n = fee > 0n ? bal / fee : 0n;
      push("gas money", bal === 0n ? "fail" : n < FEW_PAYMENTS ? "warn" : "ok", `${formatEther(bal)} ETH, about ${n > 100000n ? "100000+" : n} payments of network fees`, bal === 0n ? "send a little ETH on Robinhood Chain to " + wallet : n < FEW_PAYMENTS ? "top up a little ETH soon" : null);
    } catch (e) { push("gas money", "warn", `could not read the balance (${e.shortMessage || e.message})`); }
  }
  const fz = frozen();
  const br = cfg ? breakerOf(cfg.rules) : null;
  if (fz) push("brakes", "warn", `frozen since ${fz.at} by ${fz.by}: ${fz.reason}`, "check reinpay receipts, then reinpay unfreeze");
  else push("brakes", br ? "ok" : "warn", br ? `not frozen; the breaker freezes after ${br.count} blocked requests in ${br.minutes} minutes` : "not frozen; the circuit breaker is off", br ? null : "reinpay rule breaker 5 10");
  if (cfg) out.push(...configChecks(cfg, wallet));
  return out;
}

export const MARK = { ok: "✓", warn: "!", fail: "✕" };
export function doctorText(checks) {
  const lines = checks.map((c) => `${MARK[c.level]} ${c.name}: ${c.detail}${c.fix ? `\n    → ${c.fix}` : ""}`);
  const bad = checks.filter((c) => c.level === "fail").length, warn = checks.filter((c) => c.level === "warn").length;
  return [...lines, "", `${checks.length} checks · ${bad} to fix · ${warn} to look at`].join("\n");
}
