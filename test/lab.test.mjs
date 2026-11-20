// v0.51: Reinpay Lab, the offline parts (the run itself is in the live tests' spirit: real rules, real simulation).
import { partOf, verdict, attacks, ROWS } from "../src/lab.js";
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
check("rules map to parts of the horse", partOf("payee list") === "nose" && partOf("memo words") === "eyes" && partOf("approval line") === "bit" && partOf("repeat guard") === "bit" && partOf("daily budget") === "reins" && partOf("token contract") === "hooves" && partOf("frozen") === "heart");
const A = attacks(0.42), B = attacks(0.91);
check("seven attacks, five rule sets", A.length === 7 && Object.keys(ROWS).length === 5);
check("the draw changes wording or amounts between runs", JSON.stringify(A) !== JSON.stringify(B));
const one = A.find((a) => a.id === "airdrop"), rep = A.find((a) => a.id === "repeat"), flood = A.find((a) => a.id === "flood");
check("one request let through: the scam paid, on the part it aimed at", verdict(one, [{ status: "ready" }]).outcome === "paid" && verdict(one, [{ status: "ready" }]).part === "eyes");
check("held: named by the rule that held it", JSON.stringify(verdict(one, [{ status: "needs_approval", rule: "first payment" }])).includes('"outcome":"held"') && verdict(one, [{ status: "needs_approval", rule: "first payment" }]).part === "bit");
check("same ask ×5: one paid and four held is a hold, not a breach", verdict(rep, [{ status: "ready" }, ...Array(4).fill({ status: "needs_approval", rule: "repeat guard" })]).outcome === "held");
check("same ask ×5: two paid is a breach", verdict(rep, [{ status: "ready" }, { status: "ready" }, ...Array(3).fill({ status: "needs_approval", rule: "repeat guard" })]).outcome === "paid");
check("flood: five paid and five blocked is blocked, by the rule that stopped it", (() => { const v = verdict(flood, [...Array(5).fill({ status: "ready" }), ...Array(5).fill({ status: "blocked", rule: "payments per hour" })]); return v.outcome === "blocked" && v.rule === "payments per hour" && v.paid === 5; })());
check("flood: all ten paid is a breach", verdict(flood, Array(10).fill({ status: "ready" })).outcome === "paid");
check("requests the chain could not answer are void, never counted as blocked", verdict(one, [{ void: true }]).outcome === "void" && verdict(rep, [{ void: true }, { status: "ready" }]).voided === 1);
check("the hardened row adds blocked memo words and a daily count to cautious", ROWS.hardened.rules.memoBlock.includes("airdrop") && ROWS.hardened.rules.maxPerDay === 6 && ROWS.hardened.rules.daily.ETH === ROWS.cautious.rules.daily.ETH);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
