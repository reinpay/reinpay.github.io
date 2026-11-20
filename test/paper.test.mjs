// Statements, the first-payment rule and the digest, offline. A pretend RPC client stands in for the chain.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-paper-"));
const S = await import("../src/statement.js");
const R = await import("../src/rules.js");
const D = await import("../src/digest.js");
await import("../src/chain.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };

const owner = privateKeyToAccount(generatePrivateKey()), other = privateKeyToAccount(generatePrivateKey());
const DEAD = "0x000000000000000000000000000000000000dEaD", USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const now = Date.now(), H = (n) => "0x" + String(n).repeat(64).slice(0, 64);
const rc = (o) => ({ id: "RP-0000" + o.n, by: "agent", createdAt: now - (o.ago || 0), payee: "Burn", payeeAddress: DEAD, token: o.token || "USDG", tokenAddress: o.token === "ETH" ? null : USDG, amount: o.amount || "1", amountRaw: o.raw || "1000000", status: o.status || "sent", txHash: o.status && o.status !== "sent" ? undefined : H(o.n), block: "100", memo: "api" });
const receipts = [rc({ n: 1 }), rc({ n: 2, raw: "2500000", amount: "2.5" }), rc({ n: 3, token: "ETH", raw: "1000000000000000", amount: "0.001" }), rc({ n: 4, status: "blocked" }), rc({ n: 5, ago: 40 * 86_400_000 }), rc({ n: 6, status: "needs_approval" })];

const st = S.buildStatement(receipts, { wallet: owner.address, days: 30, now });
check("statement lists only sent payments inside the period", st.count === 3 && st.payments.map((p) => p.id).join() === "RP-00001,RP-00002,RP-00003");
check("totals per token", st.totals.USDG === "3.5" && st.totals.ETH === "0.001", JSON.stringify(st.totals));
check("each payment keeps its transaction and token contract", st.payments[0].txHash === H(1) && st.payments[0].tokenAddress === USDG && st.payments[2].tokenAddress === null);
const signed = await S.signStatement(st, owner);
check("signed by the wallet: the signature checks out", (await S.checkSignature(signed)).ok);
const t1 = structuredClone(signed); t1.payments[1].amountRaw = "25000000";
check("changing one amount breaks the signature", !(await S.checkSignature(t1)).ok);
const t2 = structuredClone(signed); t2.payments.pop(); t2.count = 2;
check("removing a payment breaks the signature", !(await S.checkSignature(t2)).ok);
let e = null; try { await S.signStatement(st, other); } catch (x) { e = x; }
check("a key that is not the wallet's cannot sign it", /does not belong/.test(e?.message || ""));
const forged = await S.signStatement({ ...st, wallet: other.address }, other); forged.wallet = owner.address;
check("signed by someone else, then relabelled: refused", !(await S.checkSignature(forged)).ok);
check("an unsigned file is refused", (await S.checkSignature(st)).reason === "not signed");
check("something that is not a statement is refused", !(await S.checkSignature({ hello: 1 })).ok);

// the chain side, with a pretend client that knows the three transactions
const pad = (a) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");
const TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const chain = {
  [H(1)]: { tx: { chainId: 4663, from: owner.address, to: USDG, value: 0n }, rc: { status: "success", blockNumber: 100n, logs: [{ address: USDG, topics: [TOPIC, pad(owner.address), pad(DEAD)], data: "0x" + (1000000).toString(16).padStart(64, "0") }] } },
  [H(2)]: { tx: { chainId: 4663, from: owner.address, to: USDG, value: 0n }, rc: { status: "success", blockNumber: 100n, logs: [{ address: USDG, topics: [TOPIC, pad(owner.address), pad(DEAD)], data: "0x" + (2500000).toString(16).padStart(64, "0") }] } },
  [H(3)]: { tx: { chainId: 4663, from: owner.address, to: DEAD, value: 1000000000000000n }, rc: { status: "success", blockNumber: 100n, logs: [] } },
};
const client = { getTransaction: async ({ hash }) => chain[hash]?.tx ?? null, getTransactionReceipt: async ({ hash }) => chain[hash]?.rc ?? null };
const full = await S.checkStatement(signed, { client });
check("full check: signature and all three payments match the chain", full.ok && full.payments.every((p) => p.ok));
chain[H(2)].rc.logs[0].data = "0x" + (2400000).toString(16).padStart(64, "0");
const bad = await S.checkStatement(signed, { client });
check("if the chain shows a different amount, that payment fails and so does the statement", !bad.ok && bad.payments[1].failed.includes("the exact amount"));
check("the text report says not to rely on it", /Do not rely/.test(S.statementCheckText(signed, bad)));

// first payment rule
const rules = { daily: { USDG: 25 }, maxPerPayment: { USDG: 10 }, approveAbove: { USDG: 5 }, repeatGuardMinutes: 0, firstPayment: "ask" };
const payee = { name: "Burn", address: DEAD };
const first = R.decide({ rules, receipts: [], request: { payee, token: "USDG", amountRaw: 1_000_000n } });
check("first payment to a payee waits for the owner", first.status === "needs_approval" && first.rule === "first payment");
const second = R.decide({ rules, receipts: [rc({ n: 1 })], request: { payee, token: "USDG", amountRaw: 1_000_000n } });
check("after one sent payment, the next one inside the rules is allowed", second.status === "allowed");
const waitingOnly = R.decide({ rules, receipts: [rc({ n: 6, status: "needs_approval" })], request: { payee, token: "USDG", amountRaw: 1_000_000n } });
check("a waiting payment does not count as paid before", waitingOnly.rule === "first payment");
check("hard limits still come first: over the max is blocked", R.decide({ rules, receipts: [], request: { payee, token: "USDG", amountRaw: 20_000_000n } }).status === "blocked");
check("rule off: first payment is allowed", R.decide({ rules: { ...rules, firstPayment: undefined }, receipts: [], request: { payee, token: "USDG", amountRaw: 1_000_000n } }).status === "allowed");

// digest
const dg = D.digestText(receipts, { days: 1, now });
check("digest: today's totals per token", /USDG: sent 3.5 \(2\)/.test(dg) && /ETH: sent 0.001 \(1\)/.test(dg), dg.split("\n")[1]);
check("digest: says how many wait for you", /1 waiting for you: reinpay pending/.test(dg));
check("digest: names what blocked most", /Most blocked by: unknown \(1\)/.test(dg));
check("digest: shows a freeze loudly", /FROZEN since x by breaker: loop/.test(D.digestText(receipts, { now, freeze: { at: "x", by: "breaker", reason: "loop" } })));
check("digest: a quiet day says so", /No payment requests/.test(D.digestText([], { now })));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
