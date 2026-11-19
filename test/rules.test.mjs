// The rules engine, offline: every rule, its order, and the arithmetic in base units. No network, no files.
import { decide, parseAmount, findPayee, totals, localDay, localWeek, localMonth } from "../src/rules.js";

let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

const rules = { daily: { USDG: "50", ETH: "0.01" }, maxPerPayment: { USDG: "20", ETH: "0.005" }, approveAbove: { USDG: "10", ETH: "0.002" }, repeatGuardMinutes: 10, autoSend: false };
const A = "0x000000000000000000000000000000000000dEaD", B = "0x00000000000000000000000000000000DeaDBeef";
const payees = [{ name: "Weather API", address: A }, { name: "GPU credits", address: B, tokens: ["USDG"], maxPerPayment: { USDG: "8" } }, { name: "Old vendor", address: "0x1111111111111111111111111111111111111111", disabled: true }];
const now = new Date(2026, 10, 18, 12, 0, 0).getTime();
const usdg = (s) => parseAmount(s, "USDG"), eth = (s) => parseAmount(s, "ETH");
const req = (name, token, amountRaw) => ({ payee: findPayee(payees, name), token, amountRaw });
const run = (r, receipts = [], ru = rules) => decide({ rules: ru, receipts, request: r, now });
let n = 0;
const rec = (payee, token, amountRaw, status, at = now - 3_600_000) => ({ id: `RP-${++n}`, payeeAddress: payee.address, token, amountRaw: amountRaw.toString(), status, createdAt: at });

// parsing
check("parseAmount: 12.5 USDG = 12500000 base units", usdg("12.5") === 12_500_000n);
check("parseAmount: refuses more decimals than the token has", throws(() => usdg("1.0000001"), /6 decimals/));
check("parseAmount: refuses scientific notation and negatives", throws(() => usdg("1e3"), /positive decimal/) && throws(() => usdg("-1"), /positive decimal/));
check("parseAmount: 0.000000000000000001 ETH = 1 wei", eth("0.000000000000000001") === 1n);
// payees
check("findPayee: exact name, any case", findPayee(payees, "weather api")?.address === A);
check("findPayee: by address", findPayee(payees, A.toLowerCase())?.name === "Weather API");
check("findPayee: no fuzzy match", findPayee(payees, "Weather") === null);
// decisions
const ok1 = run(req("Weather API", "USDG", usdg("6")));
check("6 USDG to a listed payee is within rules", ok1.status === "allowed" && ok1.rule === "within rules");
check("an unlisted payee is blocked", run(req("Someone else", "USDG", usdg("1"))).rule === "payee list");
check("a switched-off payee is blocked", /switched off/.test(run(req("Old vendor", "USDG", usdg("1"))).reason));
check("a payee limited to USDG cannot be paid in ETH", run(req("GPU credits", "ETH", eth("0.001"))).rule === "payee tokens");
check("zero is blocked", run(req("Weather API", "USDG", 0n)).rule === "amount");
check("above max per payment is blocked", run(req("Weather API", "USDG", usdg("20.01"))).rule === "max per payment");
check("exactly the max is not blocked by the max", run(req("Weather API", "USDG", usdg("20"))).rule !== "max per payment");
check("above the payee's own max is blocked", run(req("GPU credits", "USDG", usdg("9"))).rule === "payee max");
check("above the approval line waits for the owner", run(req("Weather API", "USDG", usdg("10.5"))).status === "needs_approval");
check("exactly the approval line is within rules", run(req("Weather API", "USDG", usdg("10"))).status === "allowed");
const P = payees[0];
const spent = [rec(P, "USDG", usdg("20"), "sent"), rec(P, "USDG", usdg("20"), "sent")];
check("daily budget counts sent payments", run(req("Weather API", "USDG", usdg("10.01")), spent).rule === "daily budget");
check("daily budget allows the exact remainder", run(req("Weather API", "USDG", usdg("10")), spent).status === "allowed");
check("daily budget counts payments waiting for the owner", run(req("Weather API", "USDG", usdg("1")), [...spent, rec(P, "USDG", usdg("9.5"), "needs_approval")]).rule === "daily budget");
check("blocked, rejected and failed payments do not use the budget", run(req("Weather API", "USDG", usdg("10")), [...spent, rec(P, "USDG", usdg("15"), "blocked"), rec(P, "USDG", usdg("15"), "rejected"), rec(P, "USDG", usdg("15"), "failed")]).status === "allowed");
const yesterday = [rec(P, "USDG", usdg("20"), "sent", now - 86_400_000), rec(P, "USDG", usdg("20"), "sent", now - 86_400_000)];
check("yesterday's spending does not count today", run(req("Weather API", "USDG", usdg("10")), yesterday).status === "allowed");
check("budgets are per token", run(req("Weather API", "ETH", eth("0.001")), spent).status === "allowed");
check("a token with no daily budget cannot be spent", run(req("Weather API", "ETH", eth("0.001")), [], { ...rules, daily: { USDG: "50" } }).rule === "daily budget");
const recent = [rec(P, "USDG", usdg("6"), "sent", now - 60_000)];
check("the same payment again within the guard waits for the owner", run(req("Weather API", "USDG", usdg("6")), recent).rule === "repeat guard");
check("a different amount is not a repeat", run(req("Weather API", "USDG", usdg("6.01")), recent).status === "allowed");
check("the same payment after the guard window is fine", run(req("Weather API", "USDG", usdg("6")), [rec(P, "USDG", usdg("6"), "sent", now - 11 * 60_000)]).status === "allowed");
check("repeat guard 0 turns it off", run(req("Weather API", "USDG", usdg("6")), recent, { ...rules, repeatGuardMinutes: 0 }).status === "allowed");
check("hard limits win over the repeat guard", run(req("Weather API", "USDG", usdg("25")), recent).rule === "max per payment");
check("excludeId leaves the payment being approved out of its own totals",
  decide({ rules, receipts: [...spent, { ...rec(P, "USDG", usdg("10"), "needs_approval"), id: "RP-X" }], request: req("Weather API", "USDG", usdg("10")), now, excludeId: "RP-X" }).status === "allowed");
const t = totals([...spent, rec(P, "USDG", usdg("3"), "ready")], "USDG", now);
check("totals: sent 40, waiting 3", t.spent === usdg("40") && t.held === usdg("3"));
check("localDay uses the local calendar", localDay(now) === "2026-11-18");
check("bad rule values are refused, not guessed", throws(() => run(req("Weather API", "USDG", usdg("1")), [], { ...rules, daily: { USDG: "fifty" } }), /plain decimal/));

// 0.2.0: a payee's own daily budget, on top of the wallet's
{
  const W = { name: "Weather API", address: A, daily: { USDG: "10" } };
  const r2 = (amountRaw) => ({ payee: W, token: "USDG", amountRaw });
  const noGuard = { ...rules, repeatGuardMinutes: 0 };
  check("payee daily budget: 6 of 10 fine when nothing was paid today", run(r2(usdg("6")), [], noGuard).status === "allowed");
  const today = [rec(W, "USDG", usdg("6"), "sent")];
  check("payee daily budget: 6 sent + 5 asked > 10 is blocked by the payee rule", run(r2(usdg("5")), today, noGuard).rule === "payee daily budget");
  check("payee daily budget: 6 sent + 4 asked = 10 is fine", run(r2(usdg("4")), today, noGuard).status === "allowed");
  check("payee daily budget counts payments still waiting", run(r2(usdg("5")), [rec(W, "USDG", usdg("6"), "needs_approval")], noGuard).rule === "payee daily budget");
  check("payee daily budget ignores other payees", run(r2(usdg("9")), [rec({ address: B }, "USDG", usdg("9"), "sent")], noGuard).status === "allowed");
  check("payee daily budget ignores yesterday", run(r2(usdg("9")), [rec(W, "USDG", usdg("9"), "sent", now - 26 * 3_600_000)], noGuard).status === "allowed");
  check("payee daily budget does not touch the other token", run({ payee: W, token: "ETH", amountRaw: eth("0.001") }, today, noGuard).status === "allowed");
  check("the wallet's daily budget still decides first", run(r2(usdg("5")), [rec({ address: B }, "USDG", usdg("48"), "sent")], noGuard).rule === "daily budget");
  const m = run(r2(usdg("5")), today, noGuard);
  check("the reason says how much is left for that payee", /Only 4 USDG of Weather API's daily 10 USDG/.test(m.reason), m.reason);
  check("totals for one payee only", totals([...today, rec({ address: B }, "USDG", usdg("9"), "sent")], "USDG", now, A).spent === usdg("6"));
}

// 0.3.0: weekly and monthly budgets (local calendar; weeks start on Monday)
{
  const Wk = { ...rules, repeatGuardMinutes: 0, weekly: { USDG: "60" }, monthly: { USDG: "100" } };
  const P0 = payees[0];
  const day = (d, h = 12) => new Date(2026, 10, d, h, 0, 0).getTime(); // November 2026; the 18th is a Wednesday
  check("localWeek: Wednesday 18 Nov 2026 is in the week of Monday 16 Nov", localWeek(now) === "2026-11-16");
  check("localWeek: Sunday 22 Nov still belongs to the week of the 16th; Monday 23 starts a new one", localWeek(day(22, 23)) === "2026-11-16" && localWeek(day(23, 0)) === "2026-11-23");
  check("localWeek across a month end: Tue 1 Dec 2026 is in the week of Mon 30 Nov", localWeek(new Date(2026, 11, 1, 9).getTime()) === "2026-11-30");
  check("localMonth", localMonth(now) === "2026-11");
  const thisWeek = [rec(P0, "USDG", usdg("20"), "sent", day(16)), rec(P0, "USDG", usdg("20"), "sent", day(17)), rec(P0, "USDG", usdg("15"), "needs_approval", day(18, 9))];
  check("weekly: 55 used this week + 6 > 60 is blocked by the weekly budget", run(req("Weather API", "USDG", usdg("6")), thisWeek, Wk).rule === "weekly budget");
  check("weekly: 55 used + 5 = 60 is fine", run(req("Weather API", "USDG", usdg("5")), thisWeek, Wk).status !== "blocked");
  check("weekly: last week's payments do not count", run(req("Weather API", "USDG", usdg("6")), [rec(P0, "USDG", usdg("58"), "sent", day(15))], Wk).status !== "blocked");
  const thisMonth = [rec(P0, "USDG", usdg("50"), "sent", day(2)), rec(P0, "USDG", usdg("45"), "sent", day(9))];
  check("monthly: 95 this month + 6 > 100 is blocked by the monthly budget", run(req("Weather API", "USDG", usdg("6")), thisMonth, Wk).rule === "monthly budget");
  check("monthly: October does not count", run(req("Weather API", "USDG", usdg("6")), [rec(P0, "USDG", usdg("99"), "sent", new Date(2026, 9, 30).getTime())], Wk).status !== "blocked");
  check("daily still decides before weekly", run(req("Weather API", "USDG", usdg("6")), [rec(P0, "USDG", usdg("48"), "sent")], Wk).rule === "daily budget");
  { const nr = run(req("Weather API", "USDG", usdg("6")), [...thisWeek, ...thisMonth], { ...rules, repeatGuardMinutes: 0 });
    check("no weekly or monthly rule set means no weekly or monthly limit", !["weekly budget", "monthly budget"].includes(nr.rule) && nr.status !== "blocked", `${nr.status} / ${nr.rule}`); }
  check("the weekly reason says what is left", /Only 5 USDG of this week's 60 USDG is left/.test(run(req("Weather API", "USDG", usdg("6")), thisWeek, Wk).reason));
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
