// Robinhood Chain mainnet (chain id 4663): the client and the two assets Reinpay spends.
import { createPublicClient, defineChain, http, getAddress } from "viem";
import { loadConfig } from "./config.js";

export const CHAIN_ID = 4663;
export const DEFAULT_RPC = "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER = "https://robinhoodchain.blockscout.com";

// USDG (Global Dollar) on Robinhood Chain. live.mjs checks symbol, decimals and code on every run.
export const BUILTIN = ["ETH", "USDG"];
export const TOKENS = {
  ETH: { symbol: "ETH", decimals: 18, address: null },
  USDG: { symbol: "USDG", decimals: 6, address: getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168") },
};

/** Load the tokens the owner added (reinpay token add) into TOKENS. Every read path calls this, so config edits take effect. */
export function syncTokens(cfg = null) {
  let list = [];
  try { list = (cfg || loadConfig()).tokens || []; } catch { list = []; }
  for (const k of Object.keys(TOKENS)) if (!BUILTIN.includes(k)) delete TOKENS[k];
  for (const t of list) {
    if (!t || BUILTIN.includes(t.symbol) || !/^[A-Z0-9]{1,11}$/.test(t.symbol)) continue;
    TOKENS[t.symbol] = { symbol: t.symbol, decimals: Number(t.decimals), address: getAddress(t.address), name: t.name || t.symbol, sourcify: t.sourcify || null };
  }
  return TOKENS;
}

export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [DEFAULT_RPC] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER } },
});

export const rpcUrl = () => process.env.REINPAY_RPC || loadConfig().rpc || DEFAULT_RPC;
export const transport = () => http(rpcUrl(), { timeout: 30_000, retryCount: 2 });

let client;
export function publicClient() {
  if (!client) client = createPublicClient({ chain: robinhoodChain, transport: transport() });
  return client;
}

export const txLink = (hash) => `${EXPLORER}/tx/${hash}`;
export const addrLink = (a) => `${EXPLORER}/address/${a}`;

export function token(symbol) {
  syncTokens();
  const t = TOKENS[String(symbol || "").toUpperCase()];
  if (!t) throw new Error(`Unknown token "${symbol}". Reinpay spends ${Object.keys(TOKENS).join(", ")}.`);
  return t;
}
