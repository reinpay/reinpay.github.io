// Payment links (EIP-681): "ethereum:<to>@4663?value=<wei>" for ETH, and
// "ethereum:<token>@4663/transfer?address=<to>&uint256=<amount>" for an ERC-20.
// Reading a link never pays anything: it only says who and how much, and whether that payee is on your list.
import { getAddress, isAddress, formatUnits } from "viem";
import { CHAIN_ID, TOKENS, syncTokens } from "./chain.js";
import { findPayee } from "./rules.js";

const num = (v) => {
  const s = String(v ?? "").trim();
  if (/^\d+$/.test(s)) return BigInt(s);
  const m = /^(\d+)(?:\.(\d+))?e(\d+)$/i.exec(s); // 1.5e18 style, as some wallets write it
  if (!m) throw new Error(`"${v}" is not a whole number.`);
  const frac = m[2] || "", exp = Number(m[3]);
  if (frac.length > exp) throw new Error(`"${v}" is not a whole number.`);
  return BigInt(m[1] + frac + "0".repeat(exp - frac.length));
};

/** Parse a link into { to, tokenAddress (null for ETH), amountRaw, chainId }. Throws with a plain reason. */
export function parseLink(link) {
  const s = String(link || "").trim();
  const m = /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(?:\/([a-zA-Z]+))?(?:\?(.*))?$/.exec(s);
  if (!m) throw new Error("Not a payment link. It should start with ethereum:0x…");
  const [, target, chain, fn, query = ""] = m;
  const chainId = chain ? Number(chain) : null;
  if (chainId !== null && chainId !== CHAIN_ID) throw new Error(`This link is for chain ${chainId}, not Robinhood Chain (${CHAIN_ID}).`);
  const q = Object.fromEntries(new URLSearchParams(query));
  if (!fn) {
    if (!isAddress(target)) throw new Error("The address in the link is not valid.");
    if (q.value === undefined) throw new Error("The link has no amount (value=).");
    return { to: getAddress(target), tokenAddress: null, amountRaw: num(q.value), chainId };
  }
  if (fn !== "transfer") throw new Error(`Only transfer links are supported, not "${fn}".`);
  if (!isAddress(q.address || "")) throw new Error("The link has no valid recipient (address=).");
  if (q.uint256 === undefined) throw new Error("The link has no amount (uint256=).");
  return { to: getAddress(q.address), tokenAddress: getAddress(target), amountRaw: num(q.uint256), chainId };
}

/** What a link means against your config: { payee, token, amount, amountRaw, onList, problem, chainId } */
export function readLink(link, cfg) {
  const L = parseLink(link);
  syncTokens(cfg);
  const t = L.tokenAddress ? Object.values(TOKENS).find((x) => x.address && x.address === L.tokenAddress) : TOKENS.ETH;
  if (!t) return { ...L, amountRaw: L.amountRaw.toString(), token: null, onList: false, problem: `the token ${L.tokenAddress} is not one Reinpay spends; add it first with reinpay token add` };
  if (L.amountRaw <= 0n) return { ...L, amountRaw: "0", token: t.symbol, onList: false, problem: "the amount is zero" };
  const p = findPayee(cfg.payees, L.to);
  const amount = formatUnits(L.amountRaw, t.decimals);
  return { to: L.to, chainId: L.chainId ?? CHAIN_ID, token: t.symbol, tokenAddress: L.tokenAddress, amount, amountRaw: L.amountRaw.toString(), payee: p ? p.name : null, onList: !!p,
    problem: p ? (p.disabled ? `${p.name} is switched off` : null) : `${L.to} is not on your payee list; add it with reinpay payee add if you trust it` };
}

/** Make a link for a payee (to hand to someone who pays you, or for tests). */
export function makeLink(to, symbol, amountRaw) {
  const t = TOKENS[symbol];
  return t.address ? `ethereum:${t.address}@${CHAIN_ID}/transfer?address=${getAddress(to)}&uint256=${amountRaw}` : `ethereum:${getAddress(to)}@${CHAIN_ID}?value=${amountRaw}`;
}
