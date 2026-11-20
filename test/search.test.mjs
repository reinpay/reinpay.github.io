// v0.22: finding receipts, offline.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-search-"));
const S = await import("../src/search.js");
await import("../src/chain.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const t = (d) => new Date(d + "T12:00:00").getTime();
const rs = [
  { id: "RP-1", payee: "Weather API", payeeAddress: "0x000000000000000000000000000000000000dead", token: "USDG", amountRaw: "4000000", status: "sent", memo: "forecast 6h", rule: "within rules", createdAt: t("2026-11-01") },
  { id: "RP-2", payee: "GPU credits", payeeAddress: "0xbeef", token: "USDG", amountRaw: "12000000", status: "blocked", memo: "training run", rule: "max per payment", createdAt: t("2026-11-05") },
  { id: "RP-3", payee: "GPU credits", payeeAddress: "0xbeef", token: "ETH", amountRaw: "1000000000000000", status: "needs_approval", memo: "more gpu", rule: "approval line", createdAt: t("2026-11-10"), session: "S-1" },
];
const ids = (o) => S.search(rs, o).map((r) => r.id).join();
check("by payee name, case does not matter", ids({ payee: "gpu" }) === "RP-2,RP-3");
check("by payee address", ids({ payee: "0x000000000000000000000000000000000000dead" }) === "RP-1");
check("by token", ids({ token: "eth" }) === "RP-3");
check("by date range, until includes that whole day", ids({ since: "2026-11-02", until: "2026-11-05" }) === "RP-2");
check("by memo text", ids({ memo: "GPU" }) === "RP-3");
check("by several statuses", ids({ status: "sent,blocked" }) === "RP-1,RP-2");
check("by rule", ids({ rule: "max per payment" }) === "RP-2");
check("by session", ids({ session: "S-1" }) === "RP-3");
check("by amount range in a token", ids({ token: "USDG", min: "5" }) === "RP-2" && ids({ token: "USDG", max: "5" }) === "RP-1");
let e = null; try { S.makeFilter({ min: "5" }); } catch (x) { e = x; }
check("an amount filter without a token is refused", /needs --token/.test(e?.message || ""));
e = null; try { S.makeFilter({ since: "last week" }); } catch (x) { e = x; }
check("a bad date is refused", /not a date/.test(e?.message || ""));
check("no filter: everything", ids({}) === "RP-1,RP-2,RP-3");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
