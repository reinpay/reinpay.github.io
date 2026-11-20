// v0.26: the monthly export, offline.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-books-"));
const B = await import("../src/books.js");
const { toCSV } = await import("../src/csv.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const t = (d) => new Date(d + "T12:00:00").getTime();
const rs = [
  { id: "RP-1", createdAt: t("2026-11-03"), status: "sent", txHash: "0x1", payee: "Weather API", payeeAddress: "0xa", token: "USDG", amount: "4", networkFeeEth: "0.0000001", memo: "=HYPERLINK(\"x\")", category: "data" },
  { id: "RP-2", createdAt: t("2026-11-20"), status: "sent", txHash: "0x2", payee: "GPU", payeeAddress: "0xb", token: "ETH", amount: "0.002", ethPriceUsdg: "1800.00" },
  { id: "RP-3", createdAt: t("2026-11-21"), status: "sent", txHash: "0x3", payee: "GPU", payeeAddress: "0xb", token: "ETH", amount: "0.001" },
  { id: "RP-4", createdAt: t("2026-11-22"), status: "blocked", payee: "GPU", token: "USDG", amount: "50" },
  { id: "RP-5", createdAt: t("2026-12-01"), status: "sent", txHash: "0x5", payee: "Weather API", token: "USDG", amount: "9" },
];
const m = B.monthRows(rs, "2026-11");
check("only sent payments of that month, oldest first", m.rows.map((r) => r.id).join() === "RP-1,RP-2,RP-3");
check("totals per token", m.totals.USDG === "4" && m.totals.ETH === "0.003");
check("USD: USDG one to one, ETH at the stored price, missing when unknown", m.rows[0].usd === "4" && m.rows[1].usd === "3.60" && m.rows[2].usd === "" && m.usdMissing === 1 && m.usdTotal === "7.60");
const csv = toCSV(m.rows, B.BOOK_COLS);
check("the CSV has a header and one line per payment", csv.split("\r\n").filter(Boolean).length === 4 && csv.startsWith("date,receipt,payee"));
check("a memo that looks like a formula stays text", csv.includes(`"'=HYPERLINK(""x"")"`));
let e = null; try { B.monthRows(rs, "November"); } catch (x) { e = x; }
check("a bad month is refused", /not a month/.test(e?.message || ""));
check("an empty month: zero rows", B.monthRows(rs, "2025-01").count === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
