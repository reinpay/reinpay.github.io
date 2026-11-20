// Budget grants, the dry run, and backup/restore, offline. No network: every dry run here is decided before simulation.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const homeA = mkdtempSync(join(tmpdir(), "reinpay-planA-")), homeB = mkdtempSync(join(tmpdir(), "reinpay-planB-"));
process.env.REINPAY_HOME = homeA;
const R = await import("../src/rules.js");
const C = await import("../src/config.js");
const K = await import("../src/keystore.js");
const P = await import("../src/pay.js");
const RC = await import("../src/receipts.js");
const F = await import("../src/freeze.js");
const B = await import("../src/backup.js");
const { sealConfig } = await import("../src/seal.js");
await import("../src/chain.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const DEAD = "0x000000000000000000000000000000000000dEaD";
const now = Date.now(), soon = new Date(now + 3_600_000).toISOString(), gone = new Date(now - 1).toISOString();

// grants
const base = { daily: { USDG: 25 }, maxPerPayment: { USDG: 50 }, approveAbove: { USDG: 100 }, repeatGuardMinutes: 0 };
check("no grant: today's budget is the daily rule", R.dailyLimit(base, "USDG", now) === 25_000_000n);
check("an active grant adds to it", R.dailyLimit({ ...base, grants: [{ token: "USDG", amount: "20", until: soon }] }, "USDG", now) === 45_000_000n);
check("an expired grant adds nothing", R.dailyLimit({ ...base, grants: [{ token: "USDG", amount: "20", until: gone }] }, "USDG", now) === 25_000_000n);
check("a grant for another token adds nothing", R.dailyLimit({ ...base, grants: [{ token: "ETH", amount: "1", until: soon }] }, "USDG", now) === 25_000_000n);
check("a grant alone works as a budget for a token with no daily rule", R.dailyLimit({ grants: [{ token: "ETH", amount: "0.01", until: soon }] }, "ETH", now) === 10_000_000_000_000_000n);
const payee = { name: "Burn", address: DEAD };
const req = { payee, token: "USDG", amountRaw: 40_000_000n };
check("40 USDG is over a 25 USDG day", R.decide({ rules: base, receipts: [], request: req, now }).status === "blocked");
check("with a 20 USDG grant, 40 USDG fits", R.decide({ rules: { ...base, grants: [{ token: "USDG", amount: "20", until: soon }] }, receipts: [], request: req, now }).status === "allowed");
check("when the grant expires, it is blocked again", R.decide({ rules: { ...base, grants: [{ token: "USDG", amount: "20", until: gone }] }, receipts: [], request: req, now }).status === "blocked");

// dry run
const pk = generatePrivateKey(); const me = K.writeKeystore(pk, "throwaway-test-passphrase");
const cfg0 = { ...C.DEFAULT_CONFIG, rules: { ...C.DEFAULT_CONFIG.rules, grants: [{ token: "USDG", amount: "5", until: soon, note: "test task" }] }, payees: [{ name: "Burn", address: DEAD, isContract: false, tokens: ["USDG"] }] };
C.saveConfig(await sealConfig(cfg0, privateKeyToAccount(pk)));
check("rulesView shows the grant inside today's budget", P.rulesView().tokens.USDG.dailyBudget === "30 USDG" && P.rulesView().tokens.USDG.includesGrants?.[0]?.note === "test task");
const before = RC.allReceipts().length;
const d1 = await P.previewPayment({ payee: "Nobody", amount: "1" });
check("dry run: an unlisted payee would be blocked", d1.dryRun && d1.wouldBe === "blocked" && d1.rule === "payee list");
const d2 = await P.previewPayment({ payee: "Burn", amount: "11" });
check("dry run: over the max would be blocked", d2.wouldBe === "blocked" && d2.rule === "max per payment");
const d3 = await P.previewPayment({ payee: "Burn", amount: "1", token: "ETH" });
check("dry run: a token the payee does not take would be blocked", d3.wouldBe === "blocked" && d3.rule === "payee tokens");
F.freeze({ by: "owner", reason: "dry run test" });
check("dry run: while frozen, it would be blocked as frozen", (await P.previewPayment({ payee: "Burn", amount: "1" })).rule === "frozen");
F.unfreeze();
check("dry runs write no receipts", RC.allReceipts().length === before);
for (let i = 0; i < 6; i++) await P.previewPayment({ payee: "Nobody " + i, amount: "1" });
check("six blocked dry runs do not trip the circuit breaker", F.frozen() === null);

// backup and restore
RC.addReceipt({ by: "agent", payee: "Burn", token: "USDG", amount: "1", amountRaw: "1000000", status: "blocked", rule: "test" });
const b = B.makeBackup();
check("backup holds the encrypted keystore, not the key", b.address === me && b.payload.keystore.cipher.name === "aes-256-gcm" && !JSON.stringify(b).includes(pk.slice(2)));
check("backup holds config and receipts", b.payload.config.payees.length === 1 && b.payload.receipts.receipts.length >= 1);
K.unlock("throwaway-test-passphrase", 60_000);
check("backup never holds the passphrase", !JSON.stringify(B.makeBackup()).includes("throwaway-test-passphrase"));
K.lock();
let e = null; try { await B.restoreBackup(b); } catch (x) { e = x; }
check("restore refuses to overwrite an existing wallet", /already exists/.test(e?.message || ""));
process.env.REINPAY_HOME = homeB;
const t = structuredClone(b); t.payload.config.payees.push({ name: "Sneaky", address: "0x00000000000000000000000000000000DeaDBeef" });
e = null; try { await B.restoreBackup(t); } catch (x) { e = x; }
check("an edited backup is refused, nothing written", /hash does not match/.test(e?.message || "") && !K.keystoreExists());
e = null; try { await B.restoreBackup({ kind: "something" }); } catch (x) { e = x; }
check("something that is not a backup is refused", /not a Reinpay backup/.test(e?.message || ""));
const r = await B.restoreBackup(JSON.parse(JSON.stringify(b)));
check("restore into an empty home: same address, receipts, seal ok", r.address === me && r.receipts >= 1 && r.seal.ok, r.seal.reason);
check("the restored key opens with the same passphrase", K.loadAccount("throwaway-test-passphrase").address === me);
check("restored files are private to the owner", (await import("node:fs")).statSync(C.paths().keystore).mode % 0o1000 === 0o600);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
