// When the chain cannot be read, the token-contract check must refuse, never let an address through. Offline.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey } from "viem/accounts";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-fc-"));
process.env.REINPAY_RPC = "http://127.0.0.1:9";           // nothing listens here: every RPC call fails
const K = await import("../src/keystore.js");
const P = await import("../src/pay.js");
const C = await import("../src/config.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
K.writeKeystore(generatePrivateKey(), "throwaway-test-passphrase");
let e = null; try { await P.addPayee({ name: "Anything", address: "0x17c4735E9da7F1eeB76d1cC17C2f196F38DE64b3" }); } catch (x) { e = x; }
check("payee add with the chain unreachable is refused, not let through", /Could not (read|check)/.test(e?.message || ""), e?.message?.slice(0, 80));
check("nothing was added", C.loadConfig().payees.length === 0);
e = null; try { await P.tokenAt("0x17c4735E9da7F1eeB76d1cC17C2f196F38DE64b3"); } catch (x) { e = x; }
check("tokenAt throws instead of answering 'not a token'", !!e);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
