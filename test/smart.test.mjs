// Category budgets, payment hours and the per-hour cap, offline.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey } from "viem/accounts";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-smart-"));
const R = await import("../src/rules.js");
const REP = await import("../src/report.js");
const C = await import("../src/config.js");
const K = await import("../src/keystore.js");
const P = await import("../src/pay.js");
const SH = await import("../src/payeeshare.js");
await import("../src/chain.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const DEAD = "0x000000000000000000000000000000000000dEaD", BEEF = "0x00000000000000000000000000000000DeaDBeef";
const at = (y, mo, d, h) => new Date(y, mo - 1, d, h, 30).getTime(); // local time
const WED = at(2026, 11, 18, 14), WED_NIGHT = at(2026, 11, 18, 23), SAT = at(2026, 11, 21, 14), EARLY = at(2026, 11, 18, 3);
const base = { daily: { USDG: 100 }, maxPerPayment: { USDG: 50 }, approveAbove: { USDG: 100 }, repeatGuardMinutes: 0 };
const gpu = { name: "GPU", address: DEAD, category: "compute" }, data = { name: "Data", address: BEEF, category: "data" };
const req = (payee, usdg) => ({ payee, token: "USDG", amountRaw: BigInt(usdg) * 1_000_000n });
const rc = (o) => ({ id: "RP-" + Math.random(), createdAt: o.at, token: "USDG", amountRaw: String(BigInt(o.usdg) * 1_000_000n), status: o.status || "sent", payeeAddress: o.addr || DEAD, category: o.cat });

// hours
check("9-18 parses", JSON.stringify(R.parseHours("9-18")) === '{"from":9,"to":18}');
let e = null; try { R.parseHours("9-9"); } catch (x) { e = x; } check("an empty range is refused", /not an hour range/.test(e?.message || ""));
check("14:30 is inside 9-18", R.insideHours({ from: 9, to: 18 }, WED));
check("23:30 is outside 9-18", !R.insideHours({ from: 9, to: 18 }, WED_NIGHT));
check("22-6 wraps past midnight: 23:30 and 03:30 inside, 14:30 outside", R.insideHours({ from: 22, to: 6 }, WED_NIGHT) && R.insideHours({ from: 22, to: 6 }, EARLY) && !R.insideHours({ from: 22, to: 6 }, WED));
check("weekdays only: Saturday afternoon is outside", !R.insideHours({ from: 9, to: 18, weekdays: true }, SAT) && R.insideHours({ from: 9, to: 18, weekdays: true }, WED));
check("no hours set: always inside", R.insideHours(undefined, WED_NIGHT));
const hrs = { ...base, hours: { from: 9, to: 18 } };
check("inside hours: allowed", R.decide({ rules: hrs, receipts: [], request: req(gpu, 5), now: WED }).status === "allowed");
const q = R.decide({ rules: hrs, receipts: [], request: req(gpu, 5), now: WED_NIGHT });
check("outside hours: waits for the owner, says why", q.status === "needs_approval" && q.rule === "quiet hours" && /9:00 to 18:00/.test(q.reason));
check("outside hours, over the max: still blocked (hard limits first)", R.decide({ rules: hrs, receipts: [], request: req(gpu, 60), now: WED_NIGHT }).status === "blocked");

// per hour
const ph = { ...base, maxPerHour: 3 };
const recent = [1, 2, 3].map((k) => rc({ at: WED - k * 600_000, usdg: 1 }));
check("3 payments in the last hour with a limit of 3: the 4th is blocked", R.decide({ rules: ph, receipts: recent, request: req(gpu, 1), now: WED }).rule === "payments per hour");
check("waiting payments count too", R.decide({ rules: ph, receipts: recent.map((r) => ({ ...r, status: "needs_approval" })), request: req(gpu, 1), now: WED }).rule === "payments per hour");
check("blocked requests do not count", R.decide({ rules: ph, receipts: recent.map((r) => ({ ...r, status: "blocked" })), request: req(gpu, 1), now: WED }).status === "allowed");
check("payments older than an hour do not count", R.decide({ rules: ph, receipts: recent.map((r) => ({ ...r, createdAt: r.createdAt - 3_600_000 })), request: req(gpu, 1), now: WED }).status === "allowed");

// category budgets
const env = { ...base, categories: { compute: { daily: { USDG: "10" } } } };
const spentCompute = [rc({ at: WED - 1000, usdg: 7, cat: "compute" })];
check("compute has 3 of 10 left: 3 is allowed", R.decide({ rules: env, receipts: spentCompute, request: req(gpu, 3), now: WED }).status === "allowed");
const over = R.decide({ rules: env, receipts: spentCompute, request: req(gpu, 4), now: WED });
check("4 is over the compute budget: blocked, with what is left", over.rule === "category budget" && /Only 3 USDG of the compute budget of 10 USDG/.test(over.reason));
check("another category is not limited by compute", R.decide({ rules: env, receipts: spentCompute, request: req(data, 40), now: WED }).status === "allowed");
check("data spending does not use up compute", R.decide({ rules: env, receipts: [rc({ at: WED - 1000, usdg: 40, cat: "data", addr: BEEF })], request: req(gpu, 9), now: WED }).status === "allowed");
check("yesterday's compute spending does not count", R.decide({ rules: env, receipts: [rc({ at: WED - 86_400_000, usdg: 10, cat: "compute" })], request: req(gpu, 9), now: WED }).status === "allowed");
check("the overall daily budget still applies", R.decide({ rules: { ...env, daily: { USDG: 5 } }, receipts: [], request: req(data, 6), now: WED }).rule === "daily budget");

// report and receipts
const rep = REP.spendingReport([rc({ at: Date.now(), usdg: 2, cat: "compute" }), rc({ at: Date.now(), usdg: 3, cat: "compute" }), rc({ at: Date.now(), usdg: 1 })], { days: 1 });
check("report sums spending per category", rep.byCategory.length === 1 && rep.byCategory[0].sent === "5" && rep.byCategory[0].payments === 2);
check("report text has a By category section", /By category:\n  compute: 5 USDG in 2/.test(REP.reportText(rep)));
K.writeKeystore(generatePrivateKey(), "throwaway-test-passphrase");
const cfg = C.loadConfig(); cfg.rules.categories = { compute: { daily: { USDG: "10" } } }; cfg.rules.maxPerHour = 20; cfg.rules.hours = { from: 9, to: 18, weekdays: true };
cfg.payees.push({ name: "GPU", address: DEAD, isContract: false, category: "compute" }); C.saveConfig(cfg);
const r1 = await P.requestPayment({ payee: "GPU", amount: "11", token: "USDG", memo: "x" }, { by: "test" });
check("a receipt keeps the payee's category", r1.category === "compute");
const rv = P.rulesView();
check("get_rules shows category budgets, hours and the per-hour cap", rv.categoryBudgets?.compute?.USDG === "10 USDG a day" && /weekdays only/.test(rv.paymentHours) && rv.maxPaymentsPerHour === 20 && rv.payees[0].category === "compute");
const acct = (await import("viem/accounts")).privateKeyToAccount(generatePrivateKey());
check("a shared payee list carries the category", (await SH.exportPayees(cfg.payees, acct)).payees[0].category === "compute");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
