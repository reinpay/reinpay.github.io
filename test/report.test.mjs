// The spending report, offline: sums in base units, per day and token, top payees, blocked rules, and the date window.
import { spendingReport, reportText } from "../src/report.js";
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const now = new Date(2026, 10, 18, 12, 0, 0).getTime(), H = 3_600_000;
const r = (payee, token, amountRaw, status, at, rule) => ({ payee, payeeAddress: "0x" + payee.length.toString(16).padStart(40, "0"), token, amountRaw: String(amountRaw), status, createdAt: at, rule });
const receipts = [
  r("Weather API", "USDG", 4_000000, "sent", now - H),
  r("Weather API", "USDG", 3_500000, "sent", now - 2 * H),
  r("GPU credits", "USDG", 8_000000, "needs_approval", now - H),
  r("Search API", "USDG", 2_000000, "blocked", now - H, "payee list"),
  r("GPU credits", "USDG", 30_000000, "blocked", now - 3 * H, "max per payment"),
  r("Search API", "USDG", 1_000000, "blocked", now - 4 * H, "payee list"),
  r("Weather API", "ETH", 1000000000000000n, "sent", now - 25 * H),
  r("Weather API", "USDG", 9_000000, "sent", now - 9 * 24 * H),
  r("GPU credits", "USDG", 5_000000, "rejected", now - 2 * H),
];
const rep = spendingReport(receipts, { days: 7, now });
check("window: 7 local days ending today", rep.to === "2026-11-18" && rep.from === "2026-11-12" && rep.perDay.length === 7);
check("USDG sent 7.5 in 2 payments (the 9 USDG from 9 days ago is outside)", rep.totals.USDG.sent === "7.5" && rep.totals.USDG.sentCount === 2);
check("USDG waiting 8 (1), blocked 3, rejected 1", rep.totals.USDG.waiting === "8" && rep.totals.USDG.waitingCount === 1 && rep.totals.USDG.blockedCount === 3 && rep.totals.USDG.rejectedOrFailed === 1);
check("ETH sent yesterday shows on yesterday's row", rep.perDay[1].tokens.ETH?.sent === "0.001" && !rep.perDay[0].tokens.ETH);
const topU = rep.topPayees.filter((p) => p.token === "USDG"), topE = rep.topPayees.filter((p) => p.token === "ETH");
check("top USDG payee is Weather API with 7.5 USDG; ETH is ranked on its own", topU[0]?.payee === "Weather API" && topU[0].sent === "7.5" && topE.length === 1 && topE[0].sent === "0.001");
check("blocked by: payee list 2, max per payment 1", rep.blockedBy[0].rule === "payee list" && rep.blockedBy[0].count === 2 && rep.blockedBy[1].count === 1);
check("days is clamped to 1-90", spendingReport(receipts, { days: 500, now }).days === 90 && spendingReport(receipts, { days: 0, now }).days === 7);
const txt = reportText(rep);
check("text report names totals and top payees", /USDG: sent 7.5 in 2 payments/.test(txt) && /Weather API: 7.5 USDG in 2/.test(txt));
check("an empty period says so", /No payment requests/.test(reportText(spendingReport([], { now }))));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
