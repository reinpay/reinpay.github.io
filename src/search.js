// Finding receipts: by status, payee, token, date range, amount range, memo text, rule or session. Pure.
import { parseUnits } from "viem";
import { TOKENS } from "./chain.js";

const dayStart = (s) => { const d = new Date(s); if (Number.isNaN(d.getTime())) throw new Error(`"${s}" is not a date, e.g. 2026-11-01`); return d.getTime(); };

/** Turn CLI or MCP options into a filter. Throws with a plain reason on a bad value. */
export function makeFilter(o = {}) {
  const f = {};
  if (o.status) f.status = String(o.status).split(",");
  if (o.payee) f.payee = String(o.payee).toLowerCase();
  if (o.token) f.token = String(o.token).toUpperCase();
  if (o.since) f.since = dayStart(o.since);
  if (o.until) f.until = dayStart(o.until) + (/T/.test(String(o.until)) ? 0 : 86_400_000);
  if (o.memo) f.memo = String(o.memo).toLowerCase();
  if (o.rule) f.rule = String(o.rule).toLowerCase();
  if (o.session) f.session = String(o.session);
  for (const k of ["min", "max"]) if (o[k] != null && o[k] !== "") {
    if (!f.token) throw new Error(`--${k} needs --token, since amounts in different tokens are not comparable.`);
    if (!/^\d+(\.\d+)?$/.test(String(o[k]))) throw new Error(`--${k} must be a plain decimal.`);
    f[k] = parseUnits(String(o[k]), TOKENS[f.token]?.decimals ?? 18);
  }
  return f;
}

export function matches(r, f) {
  if (f.status && !f.status.includes(r.status)) return false;
  if (f.payee && !String(r.payee || "").toLowerCase().includes(f.payee) && String(r.payeeAddress || "").toLowerCase() !== f.payee) return false;
  if (f.token && r.token !== f.token) return false;
  if (f.since && r.createdAt < f.since) return false;
  if (f.until && r.createdAt >= f.until) return false;
  if (f.memo && !String(r.memo || "").toLowerCase().includes(f.memo)) return false;
  if (f.rule && String(r.rule || "").toLowerCase() !== f.rule) return false;
  if (f.session && r.session !== f.session) return false;
  if (f.min != null && BigInt(r.amountRaw || 0) < f.min) return false;
  if (f.max != null && BigInt(r.amountRaw || 0) > f.max) return false;
  return true;
}

export const search = (receipts, o) => { const f = makeFilter(o); return receipts.filter((r) => matches(r, f)); };
