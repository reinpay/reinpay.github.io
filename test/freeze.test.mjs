// The brakes, offline: freeze, unfreeze, the circuit breaker, and payees that expire. No network is used.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey } from "viem/accounts";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-freeze-"));
const F = await import("../src/freeze.js");
const R = await import("../src/rules.js");
const C = await import("../src/config.js");
const K = await import("../src/keystore.js");
const P = await import("../src/pay.js");
const RC = await import("../src/receipts.js");
await import("../src/chain.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const DEAD = "0x000000000000000000000000000000000000dEaD";

// breaker setting and the pure trip check
check("breaker is on by default: 5 in 10 minutes", JSON.stringify(F.breakerOf({})) === '{"count":5,"minutes":10}');
check("breaker can be set", JSON.stringify(F.breakerOf({ breaker: { count: 3, minutes: 2 } })) === '{"count":3,"minutes":2}');
check("breaker can be turned off", F.breakerOf({ breaker: "off" }) === null);
const now = 1_800_000_000_000, blk = (i, o = {}) => ({ id: `RP-${i}`, by: "agent", status: "blocked", rule: "payee list", createdAt: now - i * 1000, ...o });
check("4 blocks in 10 minutes do not trip it", F.tripped([1, 2, 3, 4].map((i) => blk(i)), {}, now) === null);
check("5 blocks in 10 minutes trip it", F.tripped([1, 2, 3, 4, 5].map((i) => blk(i)), {}, now)?.count === 5);
check("blocks older than the window do not count", F.tripped([1, 2, 3, 4].map((i) => blk(i)).concat([blk(9, { createdAt: now - 11 * 60_000 })]), {}, now) === null);
check("the owner's own tests (by: test) do not count", F.tripped([1, 2, 3, 4, 5].map((i) => blk(i, { by: "test" })), {}, now) === null);
check("requests already blocked by the freeze do not count", F.tripped([1, 2, 3, 4, 5].map((i) => blk(i, { rule: "frozen" })), {}, now) === null);
check("waiting payments do not count", F.tripped([1, 2, 3, 4, 5].map((i) => blk(i, { status: "needs_approval" })), {}, now) === null);
check("breaker off never trips", F.tripped([1, 2, 3, 4, 5, 6, 7].map((i) => blk(i)), { breaker: "off" }, now) === null);

// freeze file
check("not frozen at first", F.frozen() === null);
const f1 = F.freeze({ by: "owner", reason: "test" });
check("freeze writes who and why", F.frozen()?.by === "owner" && F.frozen()?.reason === "test" && !!f1.at);
check("a second freeze keeps the first", F.freeze({ by: "agent", reason: "other" }).by === "owner");
check("unfreeze removes it", F.unfreeze()?.reason === "test" && F.frozen() === null);
writeFileSync(F.freezePath(), "{not json");
check("an unreadable frozen.json counts as frozen", F.frozen()?.by === "unknown");
F.unfreeze();

// durations and expiring payees
check("durations: 90m, 12h, 30d", R.parseDuration("90m") === 5_400_000 && R.parseDuration("12h") === 43_200_000 && R.parseDuration("30d") === 2_592_000_000);
check("duration off is null", R.parseDuration("off") === null);
let e = null; try { R.parseDuration("2w"); } catch (x) { e = x; } check("a bad duration is refused", /not a duration/.test(e?.message || ""));
const rules = { daily: { USDG: 25 }, maxPerPayment: { USDG: 10 }, approveAbove: { USDG: 5 }, repeatGuardMinutes: 0 };
const ok = R.decide({ rules, receipts: [], request: { payee: { name: "Burn", address: DEAD, expiresAt: new Date(now + 60_000).toISOString() }, token: "USDG", amountRaw: 1_000_000n }, now });
check("a payee before its expiry can be paid", ok.status === "allowed");
const ex = R.decide({ rules, receipts: [], request: { payee: { name: "Burn", address: DEAD, expiresAt: new Date(now - 1).toISOString() }, token: "USDG", amountRaw: 1_000_000n }, now });
check("an expired payee is blocked, with how to renew", ex.status === "blocked" && ex.rule === "payee expired" && /payee until/.test(ex.reason));

// the payment flow
K.writeKeystore(generatePrivateKey(), "throwaway-test-passphrase");
const cfg = C.loadConfig(); cfg.payees.push({ name: "Burn", address: DEAD, isContract: false, addedAt: "x" }, { name: "Old", address: "0x00000000000000000000000000000000DeaDBeef", isContract: false, expiresAt: new Date(Date.now() - 1000).toISOString() }); C.saveConfig(cfg);
check("rulesView hides expired payees from the agent", !P.rulesView().payees.some((p) => p.name === "Old"));
check("rulesView shows the breaker and that it is not frozen", P.rulesView().frozen === null && /5 blocked requests in 10 minutes/.test(P.rulesView().circuitBreaker));
F.freeze({ by: "owner", reason: "going on holiday" });
const r0 = await P.requestPayment({ payee: "Burn", amount: "1", token: "USDG", memo: "x" }, { by: "agent" });
check("while frozen, a request is blocked with the reason", r0.status === "blocked" && r0.rule === "frozen" && /going on holiday/.test(r0.reason));
const w = RC.addReceipt({ by: "agent", wallet: K.walletAddress(), payee: "Burn", payeeAddress: DEAD, token: "USDG", amountRaw: "1000000", amount: "1", status: "needs_approval", rule: "approval line", reason: "x" });
e = null; try { await P.approve(w.id, { passphrase: "throwaway-test-passphrase" }); } catch (x) { e = x; }
check("while frozen, approve is refused before anything is opened", /frozen/.test(e?.message || "") && RC.getReceipt(w.id).status === "needs_approval");
F.unfreeze();
const ids = [];
for (let i = 0; i < 5; i++) ids.push(await P.requestPayment({ payee: "Nobody " + i, amount: "1", token: "USDG", memo: "loop" }, { by: "agent" }));
check("4 blocked requests: still not frozen", ids.slice(0, 4).every((r) => r.status === "blocked") && !ids[3].history.some((h) => /Circuit breaker/.test(h.note)));
check("the 5th blocked request trips the breaker", F.frozen()?.by === "breaker" && ids[4].history.some((h) => /Circuit breaker/.test(h.note)), F.frozen()?.reason);
const r6 = await P.requestPayment({ payee: "Burn", amount: "1", token: "USDG", memo: "x" }, { by: "agent" });
check("after the breaker, even a good payee is blocked as frozen", r6.status === "blocked" && r6.rule === "frozen");
const r7 = await P.requestPayment({ payee: "Old", amount: "1", token: "USDG", memo: "x" }, { by: "test" });
check("frozen comes first, before any other rule", r7.rule === "frozen");
F.unfreeze();
const r8 = await P.requestPayment({ payee: "Old", amount: "1", token: "USDG", memo: "x" }, { by: "test" });
check("unfrozen: the expired payee is blocked by its own rule", r8.rule === "payee expired");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
