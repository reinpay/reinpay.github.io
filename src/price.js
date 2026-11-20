// ETH price in USDG, read from two WETH/USDG pools on Robinhood Chain (slot0). Used only by the USD rules.
// Fail closed: if a pool cannot be read, its tokens are not WETH/USDG, or the two prices disagree by more than 2%
// (a sign of a manipulated or broken pool), there is no price, and a payment that needs one is blocked.
import { getAddress } from "viem";
import { publicClient } from "./chain.js";

export const WETH = getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73");
export const USDG = getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
export const POOLS = ["0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca", "0x7615926023bb149f36095645c2a81dc367d39750"].map(getAddress);
export const MAX_SPREAD = 0.02;

/** Pure: USDG per ETH from a pool's sqrtPriceX96 (token0 WETH 18 decimals, token1 USDG 6 decimals). */
export const fromSqrt = (sqrt) => { const q = Number(sqrt) / 2 ** 96; return q * q * 1e12; };

/** Pure: given two prices, the one to use or a reason there is none. */
export function agree(prices) {
  const ok = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (ok.length < 2) return { price: null, reason: "fewer than two WETH/USDG pools answered" };
  const lo = Math.min(...ok), hi = Math.max(...ok);
  if ((hi - lo) / lo > MAX_SPREAD) return { price: null, reason: `the two WETH/USDG pools disagree (${lo.toFixed(2)} and ${hi.toFixed(2)} USDG)` };
  return { price: (lo + hi) / 2, reason: null };
}

let cache = null;
/** { price (USDG per ETH) | null, reason, at, pools } with a 30 second cache. `client` is for tests. */
export async function ethPrice({ client = publicClient(), maxAgeMs = 30_000, now = Date.now() } = {}) {
  if (cache && now - cache.at < maxAgeMs && !arguments[0]?.client) return cache;
  const prices = await Promise.all(POOLS.map(async (pool) => {
    try {
      // Read raw words: pool forks differ in how many fields slot0 returns, but the first is always sqrtPriceX96.
      const call = (data) => client.request({ method: "eth_call", params: [{ to: pool, data }, "latest"] });
      const [t0, t1, s0] = await Promise.all([call("0x0dfe1681"), call("0xd21220a7"), call("0x3850c7bd")]);
      if (getAddress("0x" + t0.slice(-40)) !== WETH || getAddress("0x" + t1.slice(-40)) !== USDG || !s0 || s0.length < 66) return NaN;
      return fromSqrt(BigInt("0x" + s0.slice(2, 66)));
    } catch { return NaN; }
  }));
  const a = agree(prices);
  const out = { ...a, at: now, pools: POOLS.map((p, i) => ({ pool: p, price: Number.isFinite(prices[i]) ? Number(prices[i].toFixed(4)) : null })) };
  if (!arguments[0]?.client) cache = out;
  return out;
}

/** USD value (in USDG base units, 6 decimals) of an amount, or { value: null, reason } when there is no price. */
export async function usdValue(symbol, amountRaw, opts = {}) {
  if (symbol === "USDG") return { value: BigInt(amountRaw), price: 1, reason: null };
  if (symbol !== "ETH") return { value: null, reason: `there is no price for ${symbol}; the USD rules only cover USDG and ETH` };
  const p = await ethPrice(opts);
  if (p.price === null) return { value: null, reason: p.reason };
  const micro = BigInt(Math.round(p.price * 1e6));                        // USDG per ETH, 6 decimals
  return { value: (BigInt(amountRaw) * micro) / 10n ** 18n, price: p.price, reason: null };
}
