// v0.21: session budgets, offline.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-sess-"));
const SS = await import("../src/session.js");
const R = await import("../src/rules.js");
await import("../src/chain.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
check("USDG:5,ETH:0.002 parses", JSON.stringify(SS.parseSession("USDG:5, eth:0.002")) === '{"USDG":"5","ETH":"0.002"}');
for (const bad of ["", "USDG", "USDG:five", "USDG:-1"]) { let e = null; try { SS.parseSession(bad); } catch (x) { e = x; } check(`refused: "${bad}"`, !!e); }
const s = SS.newSession({ USDG: "5" });
check("a session has an id", /^S-[0-9a-f]{8}$/.test(s.id));
const rules = { daily: { USDG: 100, ETH: 1 }, maxPerPayment: { USDG: 100, ETH: 1 }, approveAbove: { USDG: 100, ETH: 1 }, repeatGuardMinutes: 0 };
const payee = { name: "Burn", address: "0x000000000000000000000000000000000000dEaD" };
const mine = [{ session: s.id, token: "USDG", amountRaw: "3000000", status: "sent", createdAt: Date.now() }, { session: s.id, token: "USDG", amountRaw: "1000000", status: "needs_approval", createdAt: Date.now() }];
const other = [{ session: "S-other", token: "USDG", amountRaw: "50000000", status: "sent", createdAt: Date.now() }];
check("4 of 5 used: 1 more fits", R.decide({ rules, receipts: mine, request: { payee, token: "USDG", amountRaw: 1_000_000n, session: s } }).status === "allowed");
const d = R.decide({ rules, receipts: mine, request: { payee, token: "USDG", amountRaw: 2_000_000n, session: s } });
check("4 of 5 used: 2 more is blocked by the session budget, saying what is used", d.rule === "session budget" && /4 USDG is already/.test(d.reason));
check("another session's spending does not count", R.decide({ rules, receipts: other, request: { payee, token: "USDG", amountRaw: 4_000_000n, session: s } }).status === "allowed");
check("a token with no session cap is blocked in that session", R.decide({ rules, receipts: [], request: { payee, token: "ETH", amountRaw: 1n, session: s } }).rule === "session budget");
check("no session (the owner, schedules): no session rule", R.decide({ rules, receipts: mine, request: { payee, token: "USDG", amountRaw: 20_000_000n } }).status === "allowed");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
