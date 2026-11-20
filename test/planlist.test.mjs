// v0.32: reinpay check --plan, offline. The mainnet simulation is replaced by a stub that always passes, so only the rules decide.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-planlist-"));
const C = await import("../src/config.js"), K = await import("../src/keystore.js"), P = await import("../src/pay.js"), RC = await import("../src/receipts.js");
const { sealConfig } = await import("../src/seal.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const pk = generatePrivateKey(), acct = privateKeyToAccount(pk); K.writeKeystore(pk, "planlist-test-pass");
const now = new Date().toISOString();
const cfg = { ...C.DEFAULT_CONFIG, rules: { ...C.DEFAULT_CONFIG.rules }, payees: [
  { name: "Weather API", address: "0x000000000000000000000000000000000000dEaD", isContract: false, addedAt: now },
  { name: "GPU credits", address: "0x00000000000000000000000000000000DeaDBeef", isContract: false, addedAt: now }] };
C.saveConfig(await sealConfig(cfg, acct));
let sims = 0;
const ok = async () => { sims++; return { sim: { ok: true, block: 123n, gasUsed: 21000n }, feeWei: 1000n }; };
const before = RC.allReceipts().length;
const pl = await P.previewPlan([
  { payee: "Weather API", amount: "0.0005", token: "ETH" },
  { payee: "GPU credits", amount: "0.0015", token: "ETH" },
  { payee: "GPU credits", amount: "0.0015", token: "ETH" },
  { payee: "Weather API", amount: "0.001", token: "ETH" },
  { payee: "GPU credits", amount: "0.001", token: "ETH" },
  { payee: "cheap-gpu.example", amount: "0.0001", token: "ETH" },
], { _check: ok });
const w = pl.payments.map((r) => `${r.wouldBe}:${r.rule}`);
check("1st: inside every rule, ready", w[0] === "ready:within rules", w[0]);
check("2nd: above the approval line, waits", w[1] === "needs_approval:approval line", w[1]);
check("3rd: the same as the 2nd, so the repeat guard holds it", w[2] === "needs_approval:repeat guard", w[2]);
check("4th: still inside the daily budget (0.0045 of 0.005 used after it)", w[3] === "ready:within rules", w[3]);
check("5th: the daily budget is used up by the ones before it", w[4] === "blocked:daily budget" && /Only 0\.0005 ETH of today's 0\.005 ETH is left/.test(pl.payments[4].reason), pl.payments[4].reason);
check("6th: not on the payee list", w[5] === "blocked:payee list", w[5]);
check("only payments the rules let through were simulated", sims === 4, `${sims} simulations`);
check("the summary adds up", pl.summary.ready === 2 && pl.summary.needsApproval === 2 && pl.summary.blocked === 2 && pl.summary.wouldGoThrough.ETH === "0.0045 ETH", JSON.stringify(pl.summary));
check("nothing was recorded", RC.allReceipts().length === before);
let e1 = ""; try { await P.previewPlan([], { _check: ok }); } catch (e) { e1 = e.message; }
check("an empty plan is refused", /JSON list of payments/.test(e1));
let e2 = ""; try { await P.previewPlan(Array.from({ length: 51 }, () => ({ payee: "Weather API", amount: "0.0001", token: "ETH" })), { _check: ok }); } catch (e) { e2 = e.message; }
check("more than 50 payments is refused", /at most 50/.test(e2));
const bad = await P.previewPlan([{ payee: "Weather API", amount: "lots", token: "ETH" }], { _check: ok });
check("a bad amount is blocked on its own line, not a crash", bad.payments[0].wouldBe === "blocked" && bad.payments[0].rule === "amount");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
