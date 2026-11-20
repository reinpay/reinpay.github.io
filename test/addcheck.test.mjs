// v0.35: reinpay payee add runs the payee check first. What it does with each verdict, offline.
import { payeeVerdict, addStep } from "../src/payeecheck.js";
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const base = { address: "0xF04a2505afB967a1B4f43304e17994E94Bdc13A1", own: false, onList: null, lookalike: null, code: false, token: null, nonce: 12, balances: { ETH: "0", USDG: "0" } };
const step = (o, opts) => { const f = { ...base, ...o }; return addStep({ ...f, ...payeeVerdict(f) }, opts); };
check("a wallet with a history is added straight away", step({}) === "go");
check("a fresh wallet asks the owner to type yes", step({ nonce: 0 }) === "ask");
check("--yes adds a fresh wallet without asking", step({ nonce: 0 }, { yes: true }) === "go");
check("a contract asks too, verified or not", step({ code: true, sourcify: "exact_match" }) === "ask" && step({ code: true, sourcify: null }) === "ask");
check("a token contract is refused, even with --yes", step({ code: true, token: "USDG" }, { yes: true }) === "stop");
check("your own wallet is refused, even with --yes", step({ own: true }, { yes: true }) === "stop");
check("a lookalike goes to the lookalike guard (the full address typed again), even with --yes", step({ lookalike: { name: "Weather API", address: "0x000000000000000000000000000000000000dEaD" } }, { yes: true }) === "lookalike");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
