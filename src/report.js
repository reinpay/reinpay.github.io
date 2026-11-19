// Spending report from the receipts: per day and token, what was sent, what is waiting and what was blocked, plus the
// payees that received the most and the rules that blocked the most. Pure: receipts in, numbers out. No network.
import { formatUnits } from "viem";
import { TOKENS } from "./chain.js";
import { localDay, OPEN, DONE_SPENT } from "./rules.js";

const DAY = 86_400_000;
const amt = (raw, sym) => formatUnits(raw, TOKENS[sym].decimals);

/** days: how many local calendar days back, today included (1-90). */
export function spendingReport(receipts, { days = 7, now = Date.now() } = {}) {
  const n = Math.min(Math.max(Math.floor(Number(days) || 7), 1), 90);
  const dayKeys = Array.from({ length: n }, (_, i) => localDay(now - i * DAY));
  const inRange = new Set(dayKeys);
  const byDay = Object.fromEntries(dayKeys.map((d) => [d, {}]));
  const payees = {}, blockedBy = {};
  const total = {};
  for (const r of receipts) {
    const d = localDay(r.createdAt);
    if (!inRange.has(d) || !TOKENS[r.token]) continue;
    const sym = r.token, raw = BigInt(r.amountRaw || 0);
    const slot = (byDay[d][sym] ||= { sent: 0n, sentCount: 0, waiting: 0n, waitingCount: 0, blockedCount: 0, otherCount: 0 });
    const t = (total[sym] ||= { sent: 0n, sentCount: 0, waiting: 0n, waitingCount: 0, blockedCount: 0, otherCount: 0 });
    if (DONE_SPENT.includes(r.status)) {
      for (const x of [slot, t]) { x.sent += raw; x.sentCount++; }
      const key = `${r.payee}|${sym}`;
      const p = (payees[key] ||= { payee: r.payee, token: sym, sent: 0n, count: 0 });
      p.sent += raw; p.count++;
    } else if (OPEN.includes(r.status)) {
      for (const x of [slot, t]) { x.waiting += raw; x.waitingCount++; }
    } else if (r.status === "blocked") {
      for (const x of [slot, t]) x.blockedCount++;
      blockedBy[r.rule || "unknown"] = (blockedBy[r.rule || "unknown"] || 0) + 1;
    } else {
      for (const x of [slot, t]) x.otherCount++; // rejected or failed
    }
  }
  const show = (o, sym) => ({ sent: amt(o.sent, sym), sentCount: o.sentCount, waiting: amt(o.waiting, sym), waitingCount: o.waitingCount, blockedCount: o.blockedCount, rejectedOrFailed: o.otherCount });
  return {
    from: dayKeys[dayKeys.length - 1], to: dayKeys[0], days: n,
    totals: Object.fromEntries(Object.entries(total).map(([s, o]) => [s, show(o, s)])),
    perDay: dayKeys.map((d) => ({ day: d, tokens: Object.fromEntries(Object.entries(byDay[d]).map(([s, o]) => [s, show(o, s)])) })),
    // Ranked within each token: amounts in different tokens are never compared with each other.
    topPayees: Object.keys(TOKENS).flatMap((sym) => Object.values(payees).filter((p) => p.token === sym)
      .sort((a, b) => (b.sent > a.sent ? 1 : b.sent < a.sent ? -1 : 0)).slice(0, 5)
      .map((p) => ({ payee: p.payee, token: p.token, sent: amt(p.sent, p.token), payments: p.count }))),
    blockedBy: Object.entries(blockedBy).sort((a, b) => b[1] - a[1]).map(([rule, count]) => ({ rule, count })),
  };
}

/** Plain text for the terminal. */
export function reportText(rep) {
  const lines = [`Reinpay spending, ${rep.from} to ${rep.to} (${rep.days} day${rep.days > 1 ? "s" : ""})`, ""];
  const toks = Object.keys(rep.totals);
  if (!toks.length) return lines.concat("No payment requests in this period.").join("\n");
  for (const s of toks) {
    const t = rep.totals[s];
    lines.push(`${s}: sent ${t.sent} in ${t.sentCount} payment${t.sentCount === 1 ? "" : "s"} · waiting ${t.waiting} (${t.waitingCount}) · blocked ${t.blockedCount}${t.rejectedOrFailed ? ` · rejected or failed ${t.rejectedOrFailed}` : ""}`);
  }
  lines.push("", "Per day:");
  for (const d of rep.perDay) {
    const parts = Object.entries(d.tokens).map(([s, o]) => `${o.sent} ${s} sent${o.waitingCount ? `, ${o.waitingCount} waiting` : ""}${o.blockedCount ? `, ${o.blockedCount} blocked` : ""}`);
    lines.push(`  ${d.day}  ${parts.length ? parts.join(" · ") : "-"}`);
  }
  if (rep.topPayees.length) { lines.push("", "Top payees:"); for (const p of rep.topPayees) lines.push(`  ${p.payee}: ${p.sent} ${p.token} in ${p.payments}`); }
  if (rep.blockedBy.length) { lines.push("", "Blocked by:"); for (const b of rep.blockedBy) lines.push(`  ${b.rule}: ${b.count}`); }
  return lines.join("\n");
}
