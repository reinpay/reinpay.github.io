// CSV for spreadsheets. Fields are quoted when needed, and text that a spreadsheet would run as a formula
// (starting with = + - @, a tab or a carriage return) is prefixed with ' so it stays text. Memos come from the agent.
const FORMULA = /^[=+\-@\t\r]/;

export function cell(v) {
  if (v === null || v === undefined) return "";
  let s = typeof v === "bigint" ? v.toString() : String(v);
  if (FORMULA.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCSV = (rows, cols) => [cols.map(([h]) => cell(h)).join(","), ...rows.map((r) => cols.map(([, f]) => cell(f(r))).join(","))].join("\r\n") + "\r\n";

export const RECEIPT_COLS = [
  ["id", (r) => r.id], ["created_at", (r) => r.createdAt], ["status", (r) => r.status], ["payee", (r) => r.payee], ["payee_address", (r) => r.payeeAddress],
  ["token", (r) => r.token], ["amount", (r) => r.amount], ["memo", (r) => r.memo], ["rule", (r) => r.rule], ["reason", (r) => r.reason],
  ["tx_hash", (r) => r.txHash], ["block", (r) => r.block], ["network_fee_eth", (r) => r.networkFeeEth], ["requested_by", (r) => r.by],
];

/** One row per day and token from spendingReport(). */
export function reportCSV(rep) {
  const rows = rep.perDay.flatMap((d) => Object.entries(d.tokens).map(([token, o]) => ({ day: d.day, token, ...o })));
  return toCSV(rows, [["day", (r) => r.day], ["token", (r) => r.token], ["sent", (r) => r.sent], ["sent_count", (r) => r.sentCount], ["waiting", (r) => r.waiting], ["waiting_count", (r) => r.waitingCount], ["blocked_count", (r) => r.blockedCount], ["rejected_or_failed", (r) => r.rejectedOrFailed]]);
}
