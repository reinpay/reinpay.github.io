// v0.25: the max network fee rule, offline.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-fee-"));
const P = await import("../src/pay.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
check("no max fee: anything goes", P.feeTooHigh({}, 10n ** 18n) === null);
check("fee under the max: fine", P.feeTooHigh({ maxFeeEth: "0.0001" }, 50_000_000_000_000n) === null);
check("fee exactly at the max: fine", P.feeTooHigh({ maxFeeEth: "0.0001" }, 100_000_000_000_000n) === null);
const r = P.feeTooHigh({ maxFeeEth: "0.0001" }, 100_000_000_000_001n);
check("fee one wei over: blocked, saying both numbers", /about 0\.000100000000000001 ETH, above your max fee of 0\.0001 ETH/.test(r || ""), r);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
