// Mainnet simulation with eth_simulateV1 (traceTransfers). A payment is only accepted when the simulation shows exactly
// one thing leaving the wallet: the asked amount of the asked token, to the payee.
import { getAddress, toHex, decodeAbiParameters } from "viem";
import { publicClient } from "./chain.js";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const NATIVE_PSEUDO = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"; // traceTransfers reports ETH moves from this address
const topicAddr = (t) => getAddress("0x" + t.slice(26));

// Tests only: extra state overrides (a pretend balance for a throwaway wallet), applied inside the simulation and nowhere else.
let testOverrides = null;
export const _setTestOverrides = (fn) => { testOverrides = fn; };
export const _getTestOverrides = () => testOverrides;

/** Simulate one call from `from`. Returns { ok, error, gasUsed, block, outflows: [{token, to, amount}] }. */
export async function simulate(from, tx, { stateOverrides } = {}) {
  const c = publicClient();
  stateOverrides = stateOverrides ?? (testOverrides ? testOverrides(from) : undefined);
  const block = await c.getBlockNumber();
  const call = { from, to: tx.to, data: tx.data ?? "0x", value: toHex(tx.value ?? 0n) };
  const res = await c.request({
    method: "eth_simulateV1",
    params: [{ blockStateCalls: [{ calls: [call], ...(stateOverrides ? { stateOverrides } : {}) }], traceTransfers: true, validation: false }, toHex(block)],
  });
  const r = res?.[0]?.calls?.[0];
  if (!r) throw new Error("The RPC returned no simulation result.");
  const ok = r.status === "0x1";
  const outflows = [];
  for (const log of r.logs || []) {
    if (log.topics?.[0] !== TRANSFER || log.topics.length < 3) continue;
    const src = topicAddr(log.topics[1]);
    if (src !== getAddress(from)) continue;
    const [amount] = decodeAbiParameters([{ type: "uint256" }], log.data);
    outflows.push({ token: log.address.toLowerCase() === NATIVE_PSEUDO ? null : getAddress(log.address), to: topicAddr(log.topics[2]), amount });
  }
  return { ok, error: ok ? null : r.error?.message || "reverted", gasUsed: BigInt(r.gasUsed || "0x0"), block, outflows };
}

/** Null when the simulation matches the payment exactly; otherwise the reason it does not. */
export function mismatch(sim, { tokenAddress, to, amount }) {
  if (!sim.ok) return `the transfer would fail on mainnet (${sim.error})`;
  const want = { token: tokenAddress ? getAddress(tokenAddress) : null, to: getAddress(to), amount };
  const hits = sim.outflows.filter((o) => o.token === want.token && o.to === want.to && o.amount === want.amount);
  const other = sim.outflows.filter((o) => !(o.token === want.token && o.to === want.to && o.amount === want.amount));
  if (hits.length !== 1) return `the simulation did not show exactly one transfer of the asked amount to the payee (saw ${sim.outflows.length} outflows)`;
  if (other.length) return `the simulation shows ${other.length} other outflow(s) from the wallet; refusing`;
  return null;
}
