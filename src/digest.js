// The digest: a short spending summary sent to the owner's Telegram or webhook. Meant to be run on a schedule
// (cron, Task Scheduler) with `reinpay digest`. Read-only: it never signs or changes anything.
import { spendingReport } from "./report.js";
import { frozen } from "./freeze.js";

/** Pure: the message text from receipts. */
export function digestText(receipts, { days = 1, now = Date.now(), freeze = null } = {}) {
  const rep = spendingReport(receipts, { days, now });
  const head = `Reinpay ${rep.days === 1 ? `today (${rep.to})` : `${rep.from} to ${rep.to}`}`;
  const toks = Object.entries(rep.totals);
  const lines = [head];
  if (!toks.length) lines.push("No payment requests.");
  for (const [s, t] of toks) lines.push(`${s}: sent ${t.sent} (${t.sentCount}) · waiting ${t.waitingCount} · blocked ${t.blockedCount}`);
  const waiting = receipts.filter((r) => ["needs_approval", "ready"].includes(r.status)).length;
  if (waiting) lines.push(`${waiting} waiting for you: reinpay pending`);
  if (rep.blockedBy.length) lines.push(`Most blocked by: ${rep.blockedBy.slice(0, 2).map((b) => `${b.rule} (${b.count})`).join(", ")}`);
  if (freeze) lines.push(`FROZEN since ${freeze.at} by ${freeze.by}: ${freeze.reason}`);
  return lines.join("\n");
}

export const currentDigest = (receipts, opts = {}) => digestText(receipts, { ...opts, freeze: frozen() });
