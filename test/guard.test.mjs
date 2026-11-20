// Lookalike (address poisoning) guard, offline. Addresses are the public burn address and made-up patterns no one uses.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey } from "viem/accounts";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-guard-"));
const L = await import("../src/lookalike.js");
const C = await import("../src/config.js");
const K = await import("../src/keystore.js");
const P = await import("../src/pay.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };

const DEAD = "0x000000000000000000000000000000000000dEaD";
const FAKE = "0x0000" + "1".repeat(32) + "dead";          // same first 4 and last 4 hex as DEAD
const NEAR = "0x0001" + "0".repeat(32) + "dead";          // first 4 differ
const TAIL = "0x0000" + "0".repeat(32) + "beef";          // last 4 differ
check("same start and end, different address: looks alike", L.looksLike(FAKE, DEAD));
check("the same address is not a lookalike of itself", !L.looksLike(DEAD, DEAD.toLowerCase()));
check("case does not matter", L.looksLike(FAKE.toUpperCase().replace("0X", "0x"), DEAD));
check("different start: not alike", !L.looksLike(NEAR, DEAD));
check("different end: not alike", !L.looksLike(TAIL, DEAD));
check("findLookalike names the payee it imitates", L.findLookalike(FAKE, [{ name: "Other", address: TAIL }, { name: "Burn", address: DEAD }])?.name === "Burn");
check("findLookalike returns null when nothing matches", L.findLookalike(NEAR, [{ name: "Burn", address: DEAD }]) === null);
check("lookalikePairs finds the pair in a list", JSON.stringify(L.lookalikePairs([{ name: "A", address: DEAD }, { name: "B", address: TAIL }, { name: "C", address: FAKE }])) === JSON.stringify([["A", "C"]]));

// addPayee refuses before touching the network
const cfg = C.loadConfig(); cfg.payees.push({ name: "Burn", address: DEAD, addedAt: "x" }); C.saveConfig(cfg);
let err = null; try { await P.addPayee({ name: "Burn two", address: FAKE }); } catch (e) { err = e; }
check("payee add refuses a lookalike of an existing payee", err?.code === "LOOKALIKE" && /address poisoning/.test(err.message) && err.like.name === "Burn", err?.message?.slice(0, 80));
check("nothing was added", C.loadConfig().payees.length === 1);
const me = K.writeKeystore(generatePrivateKey(), "throwaway-test-passphrase");
const selfLike = ("0x" + me.slice(2, 6) + (me.slice(6, 10).toLowerCase() === "2222" ? "3" : "2").repeat(32) + me.slice(-4)).toLowerCase();
err = null; try { await P.addPayee({ name: "Mirror", address: selfLike }); } catch (e) { err = e; }
check("payee add refuses an address that imitates your own wallet", err?.code === "LOOKALIKE" && err.like.name === "your own wallet");
err = null; try { await P.addPayee({ name: "Burn", address: TAIL }); } catch (e) { err = e; }
check("existing name check still runs", /already exists/.test(err?.message || ""));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
