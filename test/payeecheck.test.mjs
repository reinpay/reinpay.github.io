// v0.34: reinpay payee check, the verdict part, offline.
import { payeeVerdict } from "../src/payeecheck.js";
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const A = "0xF04a2505afB967a1B4f43304e17994E94Bdc13A1", base = { address: A, own: false, onList: null, lookalike: null, code: false, token: null, nonce: 12, balances: { ETH: "0.1", USDG: "0" } };
const v = (o) => payeeVerdict({ ...base, ...o });
check("a wallet with a history looks fine, with the add command", v({}).verdict === "ok" && v({}).next === `reinpay payee add "<name>" ${A}`);
check("a fresh wallet with no history: be careful", v({ nonce: 0 }).verdict === "careful" && v({ nonce: 0 }).lines.some((l) => l.includes("has never sent a transaction")));
check("a token contract: do not add, no add command", v({ code: true, token: "USDG" }).verdict === "stop" && v({ code: true, token: "USDG" }).next === null && v({ code: true, token: "USDG" }).kind === "token contract (USDG)");
check("a lookalike: do not add, names the payee it imitates", (() => { const r = v({ lookalike: { name: "Weather API", address: "0x000000000000000000000000000000000000dEaD" } }); return r.verdict === "stop" && r.lines.some((l) => l.includes('starts and ends like "Weather API"')); })());
check("your own wallet: do not add", v({ own: true }).verdict === "stop" && v({ own: true }).kind === "your own wallet");
check("an unverified contract: be careful, says so", (() => { const r = v({ code: true, sourcify: null }); return r.verdict === "careful" && r.lines.some((l) => l.includes("not verified on Sourcify")); })());
check("a verified contract: be careful about plain transfers", (() => { const r = v({ code: true, sourcify: "exact_match" }); return r.verdict === "careful" && r.lines.some((l) => l.includes("verified on Sourcify (exact match)")); })());
check("Sourcify unreachable is said, not guessed", v({ code: true, sourcify: undefined }).lines.some((l) => l.includes("Sourcify could not be reached")));
check("already on the list: no add command", (() => { const r = v({ onList: "GPU credits" }); return r.next === null && r.lines.some((l) => l.includes('already a payee, as "GPU credits"')); })());
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
