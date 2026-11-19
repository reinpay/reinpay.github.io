// The rules engine. Pure: no network, no files. One decision per payment request, naming the rule that decided it.
// Amounts are bigint base units (USDG has 6 decimals, ETH 18), never floats.
import { parseUnits, formatUnits, getAddress, isAddress } from "viem";
import { TOKENS } from "./chain.js";

export const OPEN = ["needs_approval", "ready", "sending"]; // count against today's budget while open
export const DONE_SPENT = ["sent"];

export const localDay = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A rule value from config ("10", 10, 0.002) as base units of `symbol`. null means "no limit set". */
export function limit(rules, key, symbol) {
  const v = rules?.[key]?.[symbol];
  if (v === undefined || v === null || v === "") return null;
  const s = String(v);
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`rules.${key}.${symbol} must be a plain decimal number, got "${v}".`);
  return parseUnits(s, TOKENS[symbol].decimals);
}

export const fmt = (raw, symbol) => `${formatUnits(BigInt(raw), TOKENS[symbol].decimals)} ${symbol}`;

/** Parse a user or agent amount ("12.5") into base units; throws with a plain reason. */
export function parseAmount(amount, symbol) {
  const s = String(amount ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`amount must be a positive decimal written as text, e.g. "12.5". Got "${amount}".`);
  const [, frac = ""] = s.split(".");
  if (frac.length > TOKENS[symbol].decimals) throw new Error(`${symbol} has ${TOKENS[symbol].decimals} decimals; "${s}" has more.`);
  return parseUnits(s, TOKENS[symbol].decimals);
}

/** Find a payee by name (case-insensitive, exact) or address. Never fuzzy: an agent must name the payee exactly. */
export function findPayee(payees, nameOrAddress) {
  const q = String(nameOrAddress ?? "").trim();
  if (!q) return null;
  if (isAddress(q)) return payees.find((p) => getAddress(p.address) === getAddress(q)) || null;
  return payees.find((p) => p.name.toLowerCase() === q.toLowerCase()) || null;
}

/** The local calendar week (starting Monday) as the date of its Monday, e.g. "2026-11-16". */
export const localWeek = (ms) => {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0); // midday, so a daylight-saving change cannot move the date
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d.getTime());
};
export const localMonth = (ms) => localDay(ms).slice(0, 7);
const PERIOD = { day: localDay, week: localWeek, month: localMonth };

/** Totals for one token in the local day (or week, or month) of `now`, optionally for one payee address only. */
export function totals(receipts, symbol, now, payeeAddress = null, period = "day") {
  const key = PERIOD[period];
  const cur = key(now);
  let spent = 0n, held = 0n;
  for (const r of receipts) {
    if (r.token !== symbol || key(r.createdAt) !== cur) continue;
    if (payeeAddress && r.payeeAddress !== payeeAddress) continue;
    if (DONE_SPENT.includes(r.status)) spent += BigInt(r.amountRaw);
    else if (OPEN.includes(r.status)) held += BigInt(r.amountRaw);
  }
  return { spent, held };
}

/**
 * Decide a payment request.
 * request: { payee (object from findPayee or null), token: "USDG"|"ETH", amountRaw: bigint }
 * Returns { status: "blocked" | "needs_approval" | "allowed", rule, reason }.
 * Order matters: hard limits block first; then reasons to ask the owner.
 */
export function decide({ rules, receipts, request, now = Date.now(), excludeId = null }) {
  const { payee, token: symbol, amountRaw } = request;
  const list = excludeId ? receipts.filter((r) => r.id !== excludeId) : receipts;
  if (!TOKENS[symbol]) return { status: "blocked", rule: "tokens", reason: `${symbol} is not a token Reinpay spends.` };
  if (!payee) return { status: "blocked", rule: "payee list", reason: "This payee is not on your payee list. Only the owner can add payees (reinpay payee add)." };
  if (payee.disabled) return { status: "blocked", rule: "payee list", reason: `${payee.name} is on the list but switched off.` };
  if (payee.tokens && !payee.tokens.includes(symbol)) return { status: "blocked", rule: "payee tokens", reason: `${payee.name} may only be paid in ${payee.tokens.join(" or ")}.` };
  if (!(amountRaw > 0n)) return { status: "blocked", rule: "amount", reason: "The amount must be above zero." };

  const daily = limit(rules, "daily", symbol);
  if (daily === null || daily === 0n) return { status: "blocked", rule: "daily budget", reason: `There is no daily budget for ${symbol}, so the agent may not spend it.` };
  const cap = limit(rules, "maxPerPayment", symbol);
  if (cap !== null && amountRaw > cap) return { status: "blocked", rule: "max per payment", reason: `${fmt(amountRaw, symbol)} is above the max of ${fmt(cap, symbol)} per payment.` };
  const pcap = payee.maxPerPayment?.[symbol] != null ? parseUnits(String(payee.maxPerPayment[symbol]), TOKENS[symbol].decimals) : null;
  if (pcap !== null && amountRaw > pcap) return { status: "blocked", rule: "payee max", reason: `${fmt(amountRaw, symbol)} is above ${payee.name}'s max of ${fmt(pcap, symbol)} per payment.` };
  const { spent, held } = totals(list, symbol, now);
  if (spent + held + amountRaw > daily) {
    const left = daily > spent + held ? daily - spent - held : 0n;
    return { status: "blocked", rule: "daily budget", reason: `Only ${fmt(left, symbol)} of today's ${fmt(daily, symbol)} is left (sent ${fmt(spent, symbol)}, waiting ${fmt(held, symbol)}).` };
  }
  for (const [rk, period, label] of [["weekly", "week", "weekly budget"], ["monthly", "month", "monthly budget"]]) {
    const cap = limit(rules, rk, symbol);
    if (cap === null) continue;
    const t = totals(list, symbol, now, null, period);
    if (t.spent + t.held + amountRaw > cap) {
      const left = cap > t.spent + t.held ? cap - t.spent - t.held : 0n;
      return { status: "blocked", rule: label, reason: `Only ${fmt(left, symbol)} of this ${period}'s ${fmt(cap, symbol)} is left (sent ${fmt(t.spent, symbol)}, waiting ${fmt(t.held, symbol)}).` };
    }
  }
  const pdaily = payee.daily?.[symbol] != null ? parseUnits(String(payee.daily[symbol]), TOKENS[symbol].decimals) : null;
  if (pdaily !== null) {
    const t = totals(list, symbol, now, payee.address);
    if (t.spent + t.held + amountRaw > pdaily) {
      const left = pdaily > t.spent + t.held ? pdaily - t.spent - t.held : 0n;
      return { status: "blocked", rule: "payee daily budget", reason: `Only ${fmt(left, symbol)} of ${payee.name}'s daily ${fmt(pdaily, symbol)} is left today (sent ${fmt(t.spent, symbol)}, waiting ${fmt(t.held, symbol)}).` };
    }
  }

  const guard = Number(rules.repeatGuardMinutes || 0);
  if (guard > 0) {
    const since = now - guard * 60_000;
    const dup = list.find((r) => r.payeeAddress === payee.address && r.token === symbol && BigInt(r.amountRaw) === amountRaw
      && r.createdAt >= since && (DONE_SPENT.includes(r.status) || OPEN.includes(r.status)));
    if (dup) return { status: "needs_approval", rule: "repeat guard", reason: `Same payee, token and amount as ${dup.id} within ${guard} minutes. Held in case the agent is repeating itself.` };
  }
  const line = limit(rules, "approveAbove", symbol);
  if (line !== null && amountRaw > line) return { status: "needs_approval", rule: "approval line", reason: `${fmt(amountRaw, symbol)} is above your approval line of ${fmt(line, symbol)}.` };
  return { status: "allowed", rule: "within rules", reason: "Inside every rule." };
}
