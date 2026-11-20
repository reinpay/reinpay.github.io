// Shared payee lists, signed webhooks and read-only MCP, offline.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-share-"));
const S = await import("../src/payeeshare.js");
const N = await import("../src/notify.js");
const SV = await import("../src/server.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const alice = privateKeyToAccount(generatePrivateKey()), bob = privateKeyToAccount(generatePrivateKey());
const DEAD = "0x000000000000000000000000000000000000dEaD", BEEF = "0x00000000000000000000000000000000DeaDBeef", FAKE = "0x0000" + "1".repeat(32) + "dead";

// payee lists
const f = await S.exportPayees([{ name: "Burn", address: DEAD, tokens: ["USDG"], isContract: false, addedAt: "x" }, { name: "Beef", address: BEEF, maxPerPayment: { USDG: 3 } }, { name: "Off", address: "0x0000000000000000000000000000000000000002", disabled: true }], alice);
check("export leaves out switched-off payees and local fields", f.payees.length === 2 && !("isContract" in f.payees[0]) && !("addedAt" in f.payees[0]));
check("export keeps tokens and limits", JSON.stringify(f.payees[0].tokens) === '["USDG"]' && f.payees[1].maxPerPayment.USDG === 3);
check("a fresh export checks out, signed by the exporter", (await S.checkPayeeFile(f)).ok && (await S.checkPayeeFile(f)).signer === alice.address);
const t1 = structuredClone(f); t1.payees[0].address = BEEF;
check("changing an address breaks the signature", !(await S.checkPayeeFile(t1)).ok);
const t2 = structuredClone(f); t2.payees.push({ name: "Sneaky", address: FAKE });
check("adding a payee breaks the signature", !(await S.checkPayeeFile(t2)).ok);
const t3 = structuredClone(f); t3.by = bob.address;
check("claiming another signer is refused", !(await S.checkPayeeFile(t3)).ok);
check("an unsigned or foreign file is refused", !(await S.checkPayeeFile({ ...f, signature: undefined })).ok && !(await S.checkPayeeFile({ kind: "x" })).ok);
const plan = S.planImport(f, [], bob.address);
check("import plan into an empty list: both payees added", plan.add.length === 2 && plan.skip.length === 0);
const plan2 = S.planImport(f, [{ name: "Burn", address: DEAD }], bob.address);
check("an address already on the list is skipped", plan2.add.length === 1 && /already on your list/.test(plan2.skip[0].why));
const plan3 = S.planImport(f, [{ name: "Burn", address: "0x0000000000000000000000000000000000000003" }], bob.address);
check("a name already taken is skipped", plan3.skip.some((x) => /same name|this name/.test(x.why)));
const f2 = await S.exportPayees([{ name: "Lookalike", address: FAKE }], alice);
const plan4 = S.planImport(f2, [{ name: "Burn", address: DEAD }], bob.address);
check("a payee that looks like one you have is skipped, never added", plan4.add.length === 0 && /starts and ends like Burn/.test(plan4.skip[0].why));
const f3 = await S.exportPayees([{ name: "Old", address: BEEF, expiresAt: new Date(Date.now() - 1000).toISOString() }, { name: "Bad name!!", address: DEAD }], alice);
const plan5 = S.planImport(f3, [], bob.address);
check("expired payees and bad names are skipped", plan5.add.length === 0 && plan5.skip.length === 2);

// signed webhooks
const secret = N.newSecret();
check("a new secret is 32 random bytes in hex", /^[0-9a-f]{64}$/.test(secret) && secret !== N.newSecret());
const ts = String(Math.floor(Date.now() / 1000)), body = '{"event":"payment_waiting"}';
const sig = N.signWebhook(secret, ts, body);
check("a matching signature verifies", N.verifyWebhook(secret, ts, body, sig));
check("a changed body does not", !N.verifyWebhook(secret, ts, body.replace("waiting", "sent"), sig));
check("another secret does not", !N.verifyWebhook(N.newSecret(), ts, body, sig));
check("an old timestamp does not (replay)", !N.verifyWebhook(secret, String(Number(ts) - 3600), body, N.signWebhook(secret, String(Number(ts) - 3600), body)));
check("parseNotify webhook makes a secret", /^[0-9a-f]{64}$/.test(N.parseNotify("webhook", "https://example.com/hook").secret));
let seen = null;
const fakeFetch = async (url, o) => { seen = o; return { ok: true, status: 200 }; };
await N.notifyOwner({ id: "RP-00001", amount: "1", token: "USDG", payee: "Burn", rule: "approval line", reason: "x", status: "needs_approval" }, { cfg: { notify: { type: "webhook", url: "https://example.com/hook", secret } }, fetch: fakeFetch });
check("notifications carry a signature the receiver can verify", N.verifyWebhook(secret, seen.headers["x-reinpay-timestamp"], seen.body, seen.headers["x-reinpay-signature"]));
await N.notifyOwner({ id: "RP-00002", amount: "1", token: "USDG", payee: "Burn", rule: "x", reason: "x", status: "needs_approval" }, { cfg: { notify: { type: "webhook", url: "https://example.com/hook" } }, fetch: fakeFetch });
check("an old webhook without a secret still works, unsigned", !seen.headers["x-reinpay-signature"]);

// read-only MCP
check("read-only mode leaves out request_payment only", SV.TOOLS.map((t) => t[0]).filter((n) => !SV.READ_ONLY_TOOLS.includes(n)).join() === "request_payment");
const ro = SV.buildServer({ readOnly: true }), full = SV.buildServer();
const names = (srv) => Object.keys(srv._registeredTools || {}).sort().join();
check("the read-only server registers 10 tools, the full one 11", Object.keys(ro._registeredTools || {}).length === 10 && Object.keys(full._registeredTools || {}).length === 11, names(ro));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
