// Reinpay on chain: reads the REINPAY token straight from Robinhood Chain mainnet and writes assets/chain/stats.json.
// No key, no secret, no dependencies: plain JSON-RPC. Incremental: keeps every balance in assets/chain/state.json and
// only reads the Transfer logs it has not seen yet.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
const RPC = process.env.RPC || "https://rpc.mainnet.chain.robinhood.com";
const TOKEN = "0x17c4735E9da7F1eeB76d1cC17C2f196F38DE64b3".toLowerCase();
const DEAD = "0x000000000000000000000000000000000000dead", ZERO = "0x0000000000000000000000000000000000000000";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const dir = process.argv[2] || "assets/chain";
mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0;
async function rpc(method, params) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
      if (r.status === 429 || r.status >= 500) throw new Error("http " + r.status);
      const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.rpc = true; throw e; } return j.result;
    } catch (e) { if (e.rpc && !/rate|limit exceeded|busy/i.test(e.message)) throw e; if (i >= 6) throw e; await sleep(1500 * i); }
  }
}
const call = (data, block = "latest") => rpc("eth_call", [{ to: TOKEN, data }, block]);
const pad = (a) => "0x" + a.slice(2).padStart(64, "0");
const word = (a) => a.slice(2).padStart(64, "0");
async function logsRange(from, to, out) {
  try {
    const L = await rpc("eth_getLogs", [{ address: TOKEN, topics: [TRANSFER], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]);
    out.push(...L);
  } catch (e) {
    if (to - from < 50) throw e;
    const mid = Math.floor((from + to) / 2); await logsRange(from, mid, out); await logsRange(mid + 1, to, out);
  }
}
async function deployBlock(head) {
  // No archive state on this RPC, so find the first mint (Transfer from the zero address) instead, scanning back.
  let first = null;
  for (let to = head; to > 0; to -= 5000000) {
    const from = Math.max(0, to - 4999999), L = [];
    await logsRangeT(from, to, [TRANSFER, pad(ZERO)], L);
    if (L.length) first = Math.min(...L.map((l) => parseInt(l.blockNumber, 16)));
    else if (first !== null) break;
  }
  if (first === null) throw new Error("no mint found for the token");
  return first;
}
async function logsRangeT(from, to, topics, out) {
  try { out.push(...await rpc("eth_getLogs", [{ address: TOKEN, topics, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }])); }
  catch (e) { if (to - from < 50) throw e; const mid = Math.floor((from + to) / 2); await logsRangeT(from, mid, topics, out); await logsRangeT(mid + 1, to, topics, out); }
}
const statePath = `${dir}/state.json`;
const S = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;
const head = parseInt(await rpc("eth_blockNumber", []), 16) - 3;
const st = S || { token: TOKEN, deploy: await deployBlock(head), next: 0, balances: {}, burns: [] };
if (!S) st.next = st.deploy;
const bal = new Map(Object.entries(st.balances).map(([k, v]) => [k, BigInt(v)]));
const STEP = 500000;
for (let from = st.next; from <= head; from += STEP) {
  const to = Math.min(head, from + STEP - 1), L = [];
  await logsRange(from, to, L);
  for (const l of L) {
    const f = "0x" + l.topics[1].slice(26), t = "0x" + l.topics[2].slice(26), v = BigInt(l.data);
    bal.set(f, (bal.get(f) || 0n) - v); bal.set(t, (bal.get(t) || 0n) + v);
    if (t === DEAD || (t === ZERO && f !== ZERO)) st.burns.push({ block: parseInt(l.blockNumber, 16), tx: l.transactionHash, from: f, amount: v.toString() });
  }
  st.next = to + 1;
}
for (const b of st.burns) if (!b.time) { const blk = await rpc("eth_getBlockByNumber", ["0x" + b.block.toString(16), false]); b.time = new Date(parseInt(blk.timestamp, 16) * 1000).toISOString(); }
st.balances = Object.fromEntries([...bal].filter(([, v]) => v !== 0n).map(([k, v]) => [k, v.toString()]));
// Every 15 minutes: publish only when something changed (a new burn, a holder count), or once an hour anyway.
const prevPath = `${dir}/stats.json`, prev = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, "utf8")) : null;
const holdersNow = [...bal].filter(([k, v]) => v > 0n && k !== DEAD && k !== ZERO).length;
const hourly = !prev || Date.now() - Date.parse(prev.at) > 55 * 60 * 1000;
if (prev && !hourly && prev.burns.length === st.burns.length && prev.holders === holdersNow && !process.env.FORCE) { console.log("no change since " + prev.at + ": nothing written"); process.exit(0); }
writeFileSync(statePath, JSON.stringify(st));
// What the contract itself says, read at the same head block
const hb = "0x" + head.toString(16);
const decimals = parseInt(await call("0x313ce567", hb), 16);
const total = BigInt(await call("0x18160ddd", hb));
const deadBal = BigInt(await call("0x70a08231" + word(DEAD), hb));
const sumDead = bal.get(DEAD) || 0n;
const holders = [...bal].filter(([k, v]) => v > 0n && k !== DEAD && k !== ZERO).length;
const burned = deadBal + (total < 10n ** BigInt(decimals + 9) ? 10n ** BigInt(decimals + 9) - total : 0n); // dead address plus any supply destroyed outright
const fmt = (v) => { const s = v.toString().padStart(decimals + 1, "0"); const i = s.slice(0, -decimals), f = s.slice(-decimals, -decimals + 2); return `${i}.${f}`; };
const out = { kind: "reinpay-chain-stats", version: 1, at: new Date().toISOString(), chain: "Robinhood Chain mainnet", chainId: 4663, block: head, token: TOKEN, decimals,
  totalSupply: total.toString(), deadBalance: deadBal.toString(), burned: burned.toString(), burnedPct: Number((burned * 1000000n) / (10n ** BigInt(decimals + 9))) / 10000,
  circulating: (total - deadBal).toString(), holders, logsMatchContract: sumDead === deadBal,
  burns: st.burns.map((b, i) => ({ n: i + 1, ...b })).reverse(), human: { burned: fmt(burned), circulating: fmt(total - deadBal), totalSupply: fmt(total) } };
writeFileSync(`${dir}/stats.json`, JSON.stringify(out, null, 1));
// History, one point per hour: holders and total burned at the end of each hour since launch.
// Built once from every Transfer log (block times read from the chain), then one point appended per hour.
const histPath = `${dir}/history.json`;
let H = existsSync(histPath) ? JSON.parse(readFileSync(histPath, "utf8")) : null;
const tsOf = async (b) => parseInt((await rpc("eth_getBlockByNumber", ["0x" + b.toString(16), false])).timestamp, 16);
const point = (t, block, balMap, burnedAt) => ({ t: new Date(t * 1000).toISOString(), block, holders: [...balMap].filter(([k, v]) => v > 0n && k !== DEAD && k !== ZERO).length, burned: Number(burnedAt / 10n ** 16n) / 100 });
if (!H) {
  const all = []; await logsRange(st.deploy, head, all);
  const t0 = await tsOf(st.deploy), t1 = await tsOf(head), bt = (t1 - t0) / (head - st.deploy);
  const blockAt = async (T) => { let b = Math.round(st.deploy + (T - t0) / bt); for (let k = 0; k < 3; k++) { b = Math.max(st.deploy, Math.min(head, b)); const d = (await tsOf(b)) - T; if (Math.abs(d) < 2) break; b -= Math.round(d / bt); } return Math.max(st.deploy, Math.min(head, b)); };
  const b2 = new Map(); let burnedRun = 0n, i = 0, pts = [];
  for (let T = Math.ceil(t0 / 3600) * 3600; T <= t1; T += 3600) {
    const edge = await blockAt(T);
    while (i < all.length && parseInt(all[i].blockNumber, 16) <= edge) { const l = all[i++], f = "0x" + l.topics[1].slice(26), t = "0x" + l.topics[2].slice(26), v = BigInt(l.data); b2.set(f, (b2.get(f) || 0n) - v); b2.set(t, (b2.get(t) || 0n) + v); if (t === DEAD || (t === ZERO && f !== ZERO)) burnedRun += v; }
    pts.push(point(T, edge, b2, burnedRun));
  }
  H = { kind: "reinpay-chain-history", version: 1, token: TOKEN, note: "holders and total REINPAY burned at the end of each hour, read from Robinhood Chain mainnet", points: pts };
}
const last = H.points[H.points.length - 1];
if (!last || Date.now() - Date.parse(last.t) > 55 * 60 * 1000) H.points.push(point(Math.floor(Date.now() / 1000), head, bal, deadBal));
writeFileSync(histPath, JSON.stringify(H));

console.log(JSON.stringify({ ...out, burns: out.burns.length, lastBurn: out.burns[0] }, null, 1));
