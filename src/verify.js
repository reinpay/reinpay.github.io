// reinpay verify: read a sent payment back from Robinhood Chain and check it against its receipt.
// Read-only. The receipt says what Reinpay meant to send; the chain says what happened. Each check names what it compared.
import { getAddress, decodeEventLog, parseAbiItem } from "viem";
import { publicClient, CHAIN_ID, TOKENS, syncTokens, txLink } from "./chain.js";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const eq = (a, b) => !!a && !!b && getAddress(a) === getAddress(b);

/**
 * Pure comparison of a receipt with the chain's transaction and transaction receipt. No network.
 * `want` is { wallet, payeeAddress, amountRaw, tokenAddress (null for ETH), block? }.
 * Returns [{ name, ok, detail }].
 */
export function compare(want, tx, rc) {
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok: !!ok, detail });
  const amount = BigInt(want.amountRaw);
  add("on Robinhood Chain", tx && Number(tx.chainId) === CHAIN_ID, tx ? `chain id ${Number(tx.chainId)}` : "transaction not found");
  if (!tx || !rc) { if (!rc) add("confirmed", false, "no transaction receipt yet"); return out; }
  add("confirmed and succeeded", rc.status === "success", `block ${rc.blockNumber}, status ${rc.status}`);
  if (want.block) add("same block as the receipt", String(rc.blockNumber) === String(want.block), `receipt says ${want.block}, chain says ${rc.blockNumber}`);
  add("sent from your wallet", eq(tx.from, want.wallet), `from ${tx.from}`);
  if (!want.tokenAddress) {
    add("paid the payee", eq(tx.to, want.payeeAddress), `to ${tx.to}`);
    add("the exact amount", BigInt(tx.value) === amount, `${tx.value} wei, receipt says ${amount}`);
  } else {
    add("called the token contract", eq(tx.to, want.tokenAddress), `to ${tx.to}`);
    add("no ETH sent along", BigInt(tx.value) === 0n, `${tx.value} wei`);
    const moves = [];
    for (const l of rc.logs || []) {
      if (!eq(l.address, want.tokenAddress) || l.topics?.[0] !== TRANSFER_TOPIC) continue;
      try { const e = decodeEventLog({ abi: [TRANSFER], data: l.data, topics: l.topics }); moves.push(e.args); } catch { /* not a standard Transfer */ }
    }
    const out1 = moves.filter((m) => eq(m.from, want.wallet));
    add("exactly one token transfer out of your wallet", out1.length === 1, `${out1.length} found`);
    const m = out1[0];
    add("to the payee", m && eq(m.to, want.payeeAddress), m ? `to ${m.to}` : "none");
    add("the exact amount", m && BigInt(m.value) === amount, m ? `${m.value}, receipt says ${amount}` : "none");
  }
  return out;
}

/** Check one stored receipt against the chain. Returns { id, ok, checks, explorer } or { id, ok: false, reason }. */
export async function verifyReceipt(r, { client = publicClient() } = {}) {
  if (!r) throw new Error("No such receipt.");
  if (!r.txHash) return { id: r.id, ok: false, reason: `${r.id} is ${r.status}: nothing was sent, so there is nothing on chain to check.` };
  syncTokens();
  const tokenAddress = r.token === "ETH" ? null : r.tokenAddress || TOKENS[r.token]?.address;
  if (r.token !== "ETH" && !tokenAddress) return { id: r.id, ok: false, reason: `${r.token} is no longer in your token list, so its contract address is unknown. Add it back with reinpay token add.` };
  const [tx, rc] = await Promise.all([client.getTransaction({ hash: r.txHash }).catch(() => null), client.getTransactionReceipt({ hash: r.txHash }).catch(() => null)]);
  const checks = compare({ wallet: r.wallet, payeeAddress: r.payeeAddress, amountRaw: r.amountRaw, tokenAddress, block: r.block }, tx, rc);
  return { id: r.id, txHash: r.txHash, explorer: txLink(r.txHash), ok: checks.length > 1 && checks.every((c) => c.ok), checks };
}
