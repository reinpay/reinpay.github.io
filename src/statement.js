// Signed spending statements. `reinpay statement` writes every sent payment in a period to a JSON file and signs it with
// the wallet's own key. `reinpay statement check <file>` lets anyone confirm two things without trusting the sender:
// the wallet really signed this exact file, and every payment in it is on Robinhood Chain as written.
import { keccak256, toBytes, recoverMessageAddress, getAddress, formatUnits } from "viem";
import { CHAIN_ID, TOKENS, syncTokens } from "./chain.js";
import { localDay } from "./rules.js";
import { verifyReceipt } from "./verify.js";

const DAY = 86_400_000;
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);

/** Pure: the unsigned statement for `days` local days back, today included. Only sent payments with a transaction. */
export function buildStatement(receipts, { wallet, days = 30, now = Date.now(), memos = true } = {}) {
  syncTokens();
  const n = Math.min(Math.max(Math.floor(Number(days) || 30), 1), 366);
  const from = localDay(now - (n - 1) * DAY), to = localDay(now);
  const payments = receipts
    .filter((r) => r.status === "sent" && r.txHash && localDay(r.createdAt) >= from && localDay(r.createdAt) <= to)
    .map((r) => ({ id: r.id, at: new Date(r.createdAt).toISOString(), payee: r.payee, payeeAddress: getAddress(r.payeeAddress), token: r.token,
      tokenAddress: r.token === "ETH" ? null : getAddress(r.tokenAddress || TOKENS[r.token]?.address), amount: r.amount, amountRaw: String(r.amountRaw), txHash: r.txHash, block: r.block ? String(r.block) : null, memo: memos ? r.memo || "" : "" }));
  const sums = {};
  for (const p of payments) sums[p.token] = (sums[p.token] || 0n) + BigInt(p.amountRaw);
  const decimals = (p) => (p === "ETH" ? 18 : TOKENS[p]?.decimals);
  const totals = Object.fromEntries(Object.entries(sums).map(([t, v]) => [t, decimals(t) != null ? formatUnits(v, decimals(t)) : v.toString()]));
  return { kind: "reinpay-statement", version: 1, chainId: CHAIN_ID, wallet: getAddress(wallet), from, to, generatedAt: new Date(now).toISOString(), count: payments.length, totals, payments };
}

/** The text that is signed: a fixed label plus the hash of the whole statement without its signature. */
export function statementMessage(st) {
  const { signature, ...body } = st;
  return "Reinpay statement v1\n" + keccak256(toBytes(JSON.stringify(canon(body))));
}

export async function signStatement(st, account) {
  if (getAddress(account.address) !== getAddress(st.wallet)) throw new Error("The key does not belong to the statement's wallet.");
  return { ...st, signature: { by: getAddress(account.address), sig: await account.signMessage({ message: statementMessage(st) }) } };
}

/** Pure part: who signed it, and does the signer match the wallet? */
export async function checkSignature(st) {
  if (st?.kind !== "reinpay-statement" || st.version !== 1) return { ok: false, reason: "not a Reinpay statement (v1)" };
  if (!st.signature?.sig) return { ok: false, reason: "not signed" };
  try {
    const signer = await recoverMessageAddress({ message: statementMessage(st), signature: st.signature.sig });
    if (getAddress(signer) !== getAddress(st.wallet)) return { ok: false, signer, reason: `signed by ${signer}, not by the wallet ${st.wallet}` };
    return { ok: true, signer, reason: `signed by the wallet ${signer}` };
  } catch { return { ok: false, reason: "the signature is not valid" }; }
}

/** Full check: the signature, the totals, and every payment against the chain. `client` is for tests. */
export async function checkStatement(st, { client } = {}) {
  const sig = await checkSignature(st);
  const sums = {};
  for (const p of st.payments || []) sums[p.token] = (sums[p.token] || 0n) + BigInt(p.amountRaw);
  const countOk = (st.payments || []).length === st.count;
  const chainOk = st.chainId === CHAIN_ID;
  const payments = [];
  for (const p of st.payments || []) {
    const v = await verifyReceipt({ id: p.id, status: "sent", txHash: p.txHash, wallet: st.wallet, payeeAddress: p.payeeAddress, amountRaw: p.amountRaw, token: p.token, tokenAddress: p.tokenAddress, block: p.block }, client ? { client } : {});
    payments.push({ id: p.id, ok: v.ok, failed: (v.checks || []).filter((c) => !c.ok).map((c) => c.name), reason: v.reason || null });
  }
  const ok = sig.ok && countOk && chainOk && payments.every((p) => p.ok);
  return { ok, signature: sig, chainOk, countOk, totalsRecomputed: Object.fromEntries(Object.entries(sums).map(([t, v]) => [t, v.toString()])), payments };
}

export function statementCheckText(st, res) {
  const lines = [st.purpose === "receipt" ? `Reinpay receipt ${st.payments?.[0]?.id} on ${st.from}, wallet ${st.wallet}: ${st.payments?.[0]?.amount} ${st.payments?.[0]?.token} to ${st.payments?.[0]?.payee}` : `Reinpay statement ${st.from} to ${st.to}, wallet ${st.wallet}, ${st.count} payment${st.count === 1 ? "" : "s"}`, ""];
  lines.push(`${res.signature.ok ? "✓" : "✕"} signature: ${res.signature.reason}`);
  lines.push(`${res.chainOk ? "✓" : "✕"} chain: ${st.chainId}`);
  lines.push(`${res.countOk ? "✓" : "✕"} count: ${(st.payments || []).length} listed, ${st.count} stated`);
  for (const p of res.payments) lines.push(`${p.ok ? "✓" : "✕"} ${p.id}${p.ok ? " matches the chain" : `: ${p.reason || p.failed.join(", ")}`}`);
  lines.push("", res.ok ? "Everything checks out." : `Something does not match. Do not rely on this ${st.purpose === "receipt" ? "receipt" : "statement"}.`);
  return lines.join("\n");
}

/** A proof of one sent payment, to hand to the payee or anyone else: a one-payment statement marked as a receipt. */
export function receiptProof(r, { wallet, now = Date.now(), memos = true } = {}) {
  if (!r) throw new Error("No such receipt.");
  if (r.status !== "sent" || !r.txHash) throw new Error(`${r.id} is ${r.status}; only sent payments can be shared.`);
  const day = localDay(r.createdAt);
  const st = buildStatement([r], { wallet, days: 366, now: Math.max(now, r.createdAt), memos });
  return { ...st, purpose: "receipt", from: day, to: day };
}
