// reinpay books --month: one month of sent payments for your books. One row per payment, with the USD value Reinpay
// recorded at the time (USDG one to one, ETH at the stored two-pool price), the network fee and the transaction.
// Pure: receipts in, rows and totals out. CSV goes through csv.js, which keeps memos from becoming formulas.
import { localDay } from "./rules.js";

export function monthRows(receipts, month, { memos = true } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) throw new Error(`"${month}" is not a month. Use YYYY-MM, e.g. 2026-11.`);
  const rows = receipts.filter((r) => r.status === "sent" && r.txHash && localDay(r.createdAt).startsWith(month)).sort((a, b) => a.createdAt - b.createdAt).map((r) => {
    const usd = r.usdValue != null ? r.usdValue : r.token === "USDG" ? r.amount : r.token === "ETH" && r.ethPriceUsdg ? (Number(r.amount) * Number(r.ethPriceUsdg)).toFixed(2) : "";
    return { date: localDay(r.createdAt), id: r.id, payee: r.payee, payeeAddress: r.payeeAddress, category: r.category || "", token: r.token, amount: r.amount, usd: String(usd), feeEth: r.networkFeeEth || "", txHash: r.txHash, memo: memos ? r.memo || "" : "" };
  });
  const totals = {};
  let usdKnown = 0, usdMissing = 0;
  for (const x of rows) {
    totals[x.token] = (totals[x.token] || 0) + Number(x.amount);
    if (x.usd === "") usdMissing++; else usdKnown += Number(x.usd);
  }
  return { month, count: rows.length, rows, totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Number(v.toFixed(8)).toString()])), usdTotal: usdKnown.toFixed(2), usdMissing };
}

export const BOOK_COLS = [
  ["date", (x) => x.date], ["receipt", (x) => x.id], ["payee", (x) => x.payee], ["payee_address", (x) => x.payeeAddress], ["category", (x) => x.category],
  ["token", (x) => x.token], ["amount", (x) => x.amount], ["usd_value", (x) => x.usd], ["network_fee_eth", (x) => x.feeEth], ["tx_hash", (x) => x.txHash], ["memo", (x) => x.memo],
];
