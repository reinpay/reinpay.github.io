// reinpay rules history: every seal adds one entry with what changed (before → after), linked to the entry before it
// and signed with the wallet key. Editing, removing or reordering entries breaks the chain, and the history says so.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256, toBytes, recoverMessageAddress, getAddress } from "viem";
import { HOME, writePrivate } from "./config.js";
import { sealBody, bodyHash, canon } from "./seal.js";

export const historyPath = () => join(HOME(), "rules-history.json");
export const loadHistory = () => { try { return existsSync(historyPath()) ? JSON.parse(readFileSync(historyPath(), "utf8")) : []; } catch { return null; } };
/** The seal body with notification secrets replaced by a short fingerprint: a change still shows, the secret is never stored. */
export function redact(body) {
  const b = structuredClone(body || {});
  if (b.notify) for (const k of Object.keys(b.notify)) if (/token|secret|url/i.test(k) && b.notify[k]) b.notify[k] = `(set, ${keccak256(toBytes(String(b.notify[k]))).slice(2, 10)})`;
  return b;
}
const fmt = (v) => (v === undefined ? "(none)" : typeof v === "string" ? v : JSON.stringify(v));

/** path → value, with payees keyed by name and secrets left out. */
export function flatten(body) {
  const out = {};
  const walk = (v, p) => {
    if (v && typeof v === "object" && !Array.isArray(v)) { const ks = Object.keys(v); if (!ks.length) return; for (const k of ks) walk(v[k], p ? `${p}.${k}` : k); }
    else out[p] = v;
  };
  const b = structuredClone(body || {});
  const payees = b.payees || []; delete b.payees;
  walk(b, "");
  for (const p of payees) { const { name, ...rest } = p; delete rest.addedAt; delete rest.proof; walk(rest, `payees.${name}`); if (p.proof) out[`payees.${name}.proof`] = "(proved)"; }
  return out;
}

/** [{ path, before, after }] from one body to the next, sorted by path. */
export function diff(a, b) {
  const A = flatten(a), B = flatten(b), keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort();
  return keys.filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k])).map((k) => ({ path: k, before: A[k], after: B[k] }));
}

const entryMessage = (e) => "Reinpay rules history v1\n" + keccak256(toBytes(JSON.stringify(canon({ at: e.at, by: e.by, prev: e.prev, hash: e.hash, changes: e.changes }))));
const linkOf = (e) => keccak256(toBytes(JSON.stringify(canon({ at: e.at, hash: e.hash, sig: e.sig }))));

/** Builds (and signs) the next entry, or null when nothing that the seal covers changed. */
export async function nextEntry(history, cfg, account, at = new Date().toISOString()) {
  const body = redact(sealBody(cfg)), hash = bodyHash(body), last = history[history.length - 1];
  if (last && last.hash === hash) return null;
  const changes = last ? diff(last.body, body) : [{ path: "(first entry)", before: undefined, after: "rules as sealed now" }];
  const e = { at, by: account.address, prev: last ? linkOf(last) : null, hash, changes, body };
  e.sig = await account.signMessage({ message: entryMessage(e) });
  return e;
}

export async function recordSeal(cfg, account) {
  const h = loadHistory() || [];
  const e = await nextEntry(h, cfg, account);
  if (e) writePrivate(historyPath(), JSON.stringify([...h, e], null, 1) + "\n");
  return e;
}

/** { ok, problems: [..], entries } checked against `wallet`, and against the config sealed now when given. */
export async function verifyHistory(history, wallet, cfg = null) {
  const problems = [];
  if (history === null) return { ok: false, problems: ["rules-history.json is not readable"], entries: [] };
  for (const [i, e] of history.entries()) {
    const n = `entry ${i + 1} (${e.at})`;
    try { const by = await recoverMessageAddress({ message: entryMessage(e), signature: e.sig }); if (!wallet || getAddress(by) !== getAddress(wallet)) problems.push(`${n} does not match its signature: edited after it was signed, or signed by another wallet`); }
    catch { problems.push(`${n} has a broken signature`); }
    if (bodyHash(e.body) !== e.hash) problems.push(`${n} was edited after it was signed`);
    if (i === 0 ? e.prev !== null : e.prev !== linkOf(history[i - 1])) problems.push(`${n} does not follow the entry before it (one was removed, edited or moved)`);
  }
  if (cfg && history.length && history[history.length - 1].hash !== bodyHash(redact(sealBody(cfg)))) problems.push("the rules sealed now are not the last entry: they were sealed without the history (an older version) or the file was replaced");
  return { ok: problems.length === 0, problems, entries: history };
}

export function historyLines(history, { last = 10 } = {}) {
  const L = [];
  for (const e of history.slice(-last)) {
    L.push(`${e.at.slice(0, 19).replace("T", " ")}`);
    const groups = new Map(); // a payee added or removed whole reads as one line
    for (const c of e.changes) { const m = /^payees\.(.+?)\.(address|isContract|tokens|note|expiresAt|category|daily|maxPerPayment)/.exec(c.path); if (m) { const g = groups.get(m[1]) || []; g.push(c); groups.set(m[1], g); } }
    const whole = new Set();
    for (const [name, g] of groups) {
      const addr = g.find((c) => c.path.endsWith(".address"));
      if (addr && g.every((c) => c.before === undefined)) { whole.add(name); L.push(`  payee added    ${name}  ${addr.after}`); }
      else if (addr && g.every((c) => c.after === undefined)) { whole.add(name); L.push(`  payee removed  ${name}  ${addr.before}`); }
    }
    for (const c of e.changes) {
      const m = /^payees\.(.+?)\./.exec(c.path); if (m && whole.has(m[1])) continue;
      L.push(c.path === "(first entry)" ? "  first entry: the rules as they were sealed" : `  ${c.path}  ${fmt(c.before)} → ${fmt(c.after)}`);
    }
  }
  return L;
}
