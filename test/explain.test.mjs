// v0.31: reinpay check --explain. The explanation must never disagree with decide(), offline.
import { parseUnits } from "viem";
import { decide } from "../src/rules.js";
import { explain, explainLines } from "../src/explain.js";
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };

const NOW = Date.parse("2026-11-20T12:00:00");
const W = "0x000000000000000000000000000000000000dEaD", G = "0x00000000000000000000000000000000DeaDBeef";
const base = { daily: { USDG: 25, ETH: 0.005 }, maxPerPayment: { USDG: 10, ETH: 0.002 }, approveAbove: { USDG: 5, ETH: 0.001 }, repeatGuardMinutes: 10 };
const weather = { name: "Weather API", address: W }, gpu = { name: "GPU credits", address: G };
const eth = (x) => parseUnits(String(x), 18), usdg = (x) => parseUnits(String(x), 6);
const rc = (o) => ({ id: "RP-00001", payeeAddress: W, token: "ETH", amountRaw: eth("0.0005").toString(), createdAt: NOW - 60_000, status: "ready", ...o });

const cases = [
  ["inside every rule", base, [], { payee: weather, token: "ETH", amountRaw: eth("0.0005") }, "within rules"],
  ["not on the list", base, [], { payee: null, token: "ETH", amountRaw: eth("0.0001") }, "payee list"],
  ["above the max", base, [], { payee: gpu, token: "ETH", amountRaw: eth("0.003") }, "max per payment"],
  ["above the approval line", base, [], { payee: gpu, token: "ETH", amountRaw: eth("0.0015") }, "approval line"],
  ["a repeat", base, [rc({})], { payee: weather, token: "ETH", amountRaw: eth("0.0005") }, "repeat guard"],
  ["daily budget used up", base, [rc({ amountRaw: eth("0.0049").toString(), status: "sent", createdAt: NOW - 3_600_000, payeeAddress: G })], { payee: weather, token: "ETH", amountRaw: eth("0.0005") }, "daily budget"],
  ["no budget for the token", { ...base, daily: { USDG: 25 } }, [], { payee: weather, token: "ETH", amountRaw: eth("0.0005") }, "daily budget"],
  ["memo too short", { ...base, memoMin: 10 }, [], { payee: weather, token: "USDG", amountRaw: usdg(1), memo: "hi" }, "memo"],
  ["payee switched off", base, [], { payee: { ...weather, disabled: true }, token: "ETH", amountRaw: eth("0.0005") }, "payee list"],
  ["payee expired", base, [], { payee: { ...weather, expiresAt: "2026-11-01T00:00:00Z" }, token: "ETH", amountRaw: eth("0.0005") }, "payee expired"],
  ["wrong token for the payee", base, [], { payee: { ...weather, tokens: ["USDG"] }, token: "ETH", amountRaw: eth("0.0005") }, "payee tokens"],
  ["first payment asks", { ...base, firstPayment: "ask" }, [], { payee: weather, token: "USDG", amountRaw: usdg(1) }, "first payment"],
  ["outside payment hours", { ...base, hours: { from: 1, to: 2 } }, [], { payee: weather, token: "USDG", amountRaw: usdg(1) }, "quiet hours"],
  ["session without the token", base, [], { payee: weather, token: "ETH", amountRaw: eth("0.0005"), session: { id: "s1", caps: { USDG: "5" } } }, "session budget"],
  ["weekly budget", { ...base, weekly: { USDG: 3 } }, [], { payee: weather, token: "USDG", amountRaw: usdg(4) }, "weekly budget"],
  ["payee daily budget", base, [], { payee: { ...weather, daily: { USDG: 2 } }, token: "USDG", amountRaw: usdg(3) }, "payee daily budget"],
];
for (const [label, rules, receipts, request, rule] of cases) {
  const d = decide({ rules, receipts, request, now: NOW }), { steps } = explain({ rules, receipts, request, now: NOW });
  const at = steps.findIndex((s) => s.decided);
  const agrees = d.rule === rule && (d.status === "allowed" ? at === -1 : steps[at]?.rule === d.rule);
  const before = steps.slice(0, at === -1 ? steps.length : at).every((s) => s.state === "pass" || s.state === "off");
  const after = at === -1 || steps.slice(at + 1).every((s) => s.reached === false);
  check(`${label}: decided by ${rule}, every step before it passed, the rest not reached`, agrees && before && after, `${d.rule} / ${at >= 0 ? steps[at].rule : "none"}`);
}
// a random sweep: the explanation always names decide()'s rule
let bad = 0;
for (let i = 0; i < 400; i++) {
  const amt = eth((Math.floor(Math.random() * 40) / 10000).toFixed(4));
  const rules = { ...base, ...(i % 3 === 0 ? { firstPayment: "ask" } : {}), ...(i % 5 === 0 ? { maxPerHour: 1 } : {}), ...(i % 7 === 0 ? { memoMin: 5 } : {}) };
  const receipts = i % 2 ? [rc({ amountRaw: amt.toString() })] : [];
  const request = { payee: i % 11 === 0 ? null : weather, token: "ETH", amountRaw: amt, memo: i % 4 ? "forecast bundle" : "x" };
  const d = decide({ rules, receipts, request, now: NOW }), { steps } = explain({ rules, receipts, request, now: NOW });
  const at = steps.findIndex((s) => s.decided);
  if (!(d.status === "allowed" ? at === -1 : steps[at]?.rule === d.rule)) bad++;
}
check("400 random requests: the explanation never disagrees with the decision", bad === 0, `${bad} disagreed`);
const lines = explainLines(explain({ rules: base, receipts: [], request: { payee: gpu, token: "ETH", amountRaw: eth("0.0015") }, now: NOW }).steps);
check("the terminal lines mark the deciding rule and what was not reached", lines.some((l) => /⏸ approval line.*← decided/.test(l)) && lines.some((l) => l.includes("✓ max per payment")), lines.find((l) => l.includes("decided")));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
