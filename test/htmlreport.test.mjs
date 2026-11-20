// v0.23: the HTML report, offline.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-html-"));
const REP = await import("../src/report.js");
const H = await import("../src/htmlreport.js");
await import("../src/chain.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const now = Date.now();
const rs = [
  { payee: "Weather API", payeeAddress: "0x1", token: "USDG", amountRaw: "4000000", status: "sent", createdAt: now, category: "data" },
  { payee: '<img src=x onerror=alert(1)>', payeeAddress: "0x2", token: "USDG", amountRaw: "1000000", status: "sent", createdAt: now - 86_400_000 },
  { payee: "GPU", token: "USDG", amountRaw: "50000000", status: "blocked", rule: "max per payment", createdAt: now },
];
const html = H.reportHTML(REP.spendingReport(rs, { days: 7, now }), { wallet: "0xabc" });
check("a complete document with the period in the title", html.startsWith("<!doctype html>") && /<title>Reinpay report/.test(html));
check("totals: 5 USDG sent in 2 payments, 1 blocked", /<td>5 USDG<\/td><td>2<\/td>/.test(html) && /<td>1<\/td><\/tr><\/table>/.test(html));
check("a bar chart with one bar per day", (html.match(/<rect /g) || []).length === 7);
check("top payees, categories and blocked-by sections", /Top payees/.test(html) && /By category/.test(html) && /max per payment/.test(html));
check("a payee name with markup is escaped, never run", !html.includes("<img src=x") && html.includes("&lt;img src=x onerror=alert(1)&gt;"));
check("no scripts and no outside requests", !/<script|https?:\/\//i.test(html));
check("an empty period says so", /No payment requests in this period/.test(H.reportHTML(REP.spendingReport([], { days: 3, now }))));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
