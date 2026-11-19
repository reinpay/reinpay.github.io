// Config seal and expiring unlock, offline: sign, verify, tamper, wrong key; unlock that locks itself.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-seal-"));
const { sealConfig, checkSeal } = await import("../src/seal.js");
const K = await import("../src/keystore.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };

const owner = privateKeyToAccount(generatePrivateKey()), other = privateKeyToAccount(generatePrivateKey());
const cfg = { rpc: null, rules: { daily: { USDG: "25" }, autoSend: false }, payees: [{ name: "Weather API", address: "0x000000000000000000000000000000000000dEaD" }] };
check("an unsealed config is refused", (await checkSeal(cfg, owner.address)).ok === false);
const sealed = await sealConfig(cfg, owner);
check("a config sealed by the wallet key passes", (await checkSeal(sealed, owner.address)).ok === true);
check("field order does not matter", (await checkSeal({ payees: sealed.payees, seal: sealed.seal, rules: { autoSend: false, daily: { USDG: "25" } }, rpc: null }, owner.address)).ok === true);
const t1 = structuredClone(sealed); t1.payees.push({ name: "Attacker", address: "0x000000000000000000000000000000000000bEEF" });
check("adding a payee by editing the file breaks the seal", (await checkSeal(t1, owner.address)).ok === false);
const t2 = structuredClone(sealed); t2.rules.daily.USDG = "100000";
check("raising a budget by editing the file breaks the seal", (await checkSeal(t2, owner.address)).ok === false);
const t3 = structuredClone(sealed); t3.rules.autoSend = true;
check("turning autosend on by editing the file breaks the seal", (await checkSeal(t3, owner.address)).ok === false);
const forged = await sealConfig(t1, other);
check("a seal made with another key is refused", (await checkSeal(forged, owner.address)).ok === false);
const t4 = structuredClone(sealed); t4.rpc = "https://example.com";
check("fields outside rules, payees, tokens and notify do not affect the seal", (await checkSeal(t4, owner.address)).ok === true);

// expiring unlock
const pk = generatePrivateKey(); K.writeKeystore(pk, "throwaway-test-passphrase");
K.unlock("throwaway-test-passphrase", 60_000);
check("unlock for 60 s: unlocked now", K.isUnlocked() === true && K.unlockedUntil() > Date.now());
check("…and the server can open the key without a passphrase", K.loadAccount().address === privateKeyToAccount(pk).address);
check("after the time runs out it locks itself and removes the passphrase file", K.isUnlocked(Date.now() + 61_000) === false && K.isUnlocked() === false);
let e = ""; try { K.loadAccount(); } catch (x) { e = x.message; }
check("once expired, signing needs the passphrase again", /locked/.test(e));
K.unlock("throwaway-test-passphrase", 0);
check("--for=0 stays unlocked until reinpay lock", K.isUnlocked(Date.now() + 10 * 86_400_000) === true);
K.lock(); check("lock removes it", K.isUnlocked() === false);
let w = ""; try { K.unlock("wrong passphrase!!", 60_000); } catch (x) { w = x.message; }
check("a wrong passphrase does not unlock", /Wrong passphrase/.test(w) && K.isUnlocked() === false);
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
