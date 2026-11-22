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
if (prev && !hourly && prev.burns.length === st.burns.length && prev.holders === holdersNow && !process.env.FORCE) { console.log("no change since " + prev.at + ": stats unchanged"); await extras(); process.exit(0); }
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

await extras();

// Extras written on every run, changed or not: the Reinpay City snapshot and the Reinpay Galaxy data.
// Each is kept apart (try/catch) so neither can break the stats above.
async function extras() {
  // Reinpay City: the newest blocks and REINPAY transfers, played as a labelled replay where the browser cannot reach the RPC
  try {
    const top = parseInt(await rpc("eth_blockNumber", []), 16), blocks = [];
    for (let b = top - 87; b <= top; b++) { const k = await rpc("eth_getBlockByNumber", ["0x" + b.toString(16), false]); if (k) blocks.push({ n: b, ts: parseInt(k.timestamp, 16), txs: k.transactions.length, gas: +(parseInt(k.gasUsed, 16) / parseInt(k.gasLimit, 16)).toFixed(4) }); }
    const L = []; await logsRange(top - 30000, top, L);
    const transfers = L.slice(-300).map((l) => ({ b: parseInt(l.blockNumber, 16), tx: l.transactionHash, from: "0x" + l.topics[1].slice(26), to: "0x" + l.topics[2].slice(26), v: BigInt(l.data).toString() }));
    writeFileSync(`${dir}/city.json`, JSON.stringify({ kind: "reinpay-city-snapshot", version: 1, chainId: 4663, token: TOKEN, at: new Date().toISOString(), head: top, blocks, transfers }));
    console.log("city snapshot", top, blocks.length, "blocks", transfers.length, "transfers");
  } catch (e) { console.log("city snapshot skipped:", e.message); }
  // Reinpay Galaxy: every holder with the time it first received REINPAY, former holders with the time they left, burns,
  // the holder count at every change, and the dev wallet's in and out. Incremental: galaxy-state.json keeps where it stopped.
  try {
    const gp = `${dir}/galaxy-state.json`, DEVW = "0x9e9a44814544633b995829d917b70d3161db1293";
    const G = existsSync(gp) ? JSON.parse(readFileSync(gp, "utf8")) : { next: st.deploy, deploy: null, bal: {}, first: {}, left: {}, holders: 0, series: [], burns: [], code: {}, dev: { in: "0", dead: "0", other: "0" } };
    const gb = new Map(Object.entries(G.bal).map(([k, v]) => [k, BigInt(v)])), ts = new Map(), isH = (a) => a !== ZERO && a !== DEAD;
    const tsOf = async (bn) => { if (!ts.has(bn)) ts.set(bn, parseInt((await rpc("eth_getBlockByNumber", [bn, false])).timestamp, 16)); return ts.get(bn); };
    let dIn = BigInt(G.dev.in), dDead = BigInt(G.dev.dead), dOther = BigInt(G.dev.other);
    for (let from = G.next; from <= head; from += 500000) {
      const to = Math.min(head, from + 499999), L = []; await logsRange(from, to, L);
      L.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) || parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16));
      for (const l of L) {
        const t = await tsOf(l.blockNumber), fr = "0x" + l.topics[1].slice(26), to2 = "0x" + l.topics[2].slice(26), v = BigInt(l.data);
        if (!G.deploy) G.deploy = { block: parseInt(l.blockNumber, 16), time: t };
        for (const [a, d] of [[fr, -v], [to2, v]]) { const b0 = gb.get(a) || 0n, b1 = b0 + d; gb.set(a, b1);
          if (isH(a)) { if (b0 <= 0n && b1 > 0n) { G.holders++; if (!G.first[a]) G.first[a] = t; delete G.left[a]; } else if (b0 > 0n && b1 <= 0n) { G.holders--; G.left[a] = t; } } }
        if (to2 === DEAD && v > 0n) G.burns.push({ n: G.burns.length + 1, block: parseInt(l.blockNumber, 16), time: t, tx: l.transactionHash, from: fr, amount: v.toString() });
        if (to2 === DEVW) dIn += v; if (fr === DEVW) (to2 === DEAD ? (dDead += v) : (dOther += v));
        const last = G.series[G.series.length - 1]; if (!last || last[0] !== t) G.series.push([t, G.holders]); else last[1] = G.holders;
      }
      G.next = to + 1;
    }
    const cur = [...gb].filter(([a, b]) => isH(a) && b > 0n), need = cur.map(([a]) => a).filter((a) => !(a in G.code));
    for (const a of need) { const c = await rpc("eth_getCode", [a, "latest"]); G.code[a] = !!(c && c !== "0x"); }
    G.bal = Object.fromEntries([...gb].filter(([, v]) => v !== 0n).map(([k, v]) => [k, v.toString()])); G.dev = { in: dIn.toString(), dead: dDead.toString(), other: dOther.toString() };
    writeFileSync(gp, JSON.stringify(G));
    const holdersG = cur.map(([a, b]) => ({ a, bal: b.toString(), first: G.first[a], contract: G.code[a] })).sort((x, y) => (BigInt(y.bal) > BigInt(x.bal) ? 1 : -1));
    const former = Object.entries(G.left).map(([a, t]) => ({ a, first: G.first[a], left: t }));
    const burnedG = G.burns.reduce((a, b) => a + BigInt(b.amount), 0n);
    writeFileSync(`${dir}/galaxy.json`, JSON.stringify({ kind: "reinpay-galaxy", version: 1, chainId: 4663, token: TOKEN, at: new Date().toISOString(), head, deploy: G.deploy, supply: (10n ** 27n).toString(), burned: burnedG.toString(),
      dev: { a: DEVW, received: G.dev.in, toDead: G.dev.dead, elsewhere: G.dev.other, balance: (gb.get(DEVW) || 0n).toString() }, holders: holdersG, former, burns: G.burns, series: G.series }));
    console.log("galaxy", holdersG.length, "holders", former.length, "former", G.burns.length, "burns", G.series.length, "points");
  } catch (e) { console.log("galaxy skipped:", e.message); }
  // Reinpay Swap buyback tracker: the public fee wallet's balance, and every burn sent by a transaction from that wallet
  // (ETH spent, REINPAY burned, gas). Burn transactions already checked are remembered in buyback-state.json.
  try {
    const FEEW = "0xc651fc557130be361a8b45a7ed19405dd06d9317", bp = `${dir}/buyback-state.json`;
    const B = existsSync(bp) ? JSON.parse(readFileSync(bp, "utf8")) : { checked: {}, buybacks: [] };
    for (const b of st.burns) { const k = b.tx.toLowerCase(); if (k in B.checked) continue;
      const tx = await rpc("eth_getTransactionByHash", [b.tx]); const mine = tx && tx.from.toLowerCase() === FEEW; B.checked[k] = mine;
      if (mine) { const rc = await rpc("eth_getTransactionReceipt", [b.tx]); const blk = await rpc("eth_getBlockByNumber", [tx.blockNumber, false]);
        B.buybacks.push({ tx: b.tx, block: parseInt(tx.blockNumber, 16), time: parseInt(blk.timestamp, 16), eth: BigInt(tx.value).toString(), burned: b.amount, gas: (BigInt(rc.gasUsed) * BigInt(rc.effectiveGasPrice || tx.gasPrice || "0x0")).toString() }); } }
    B.buybacks.sort((x, y) => x.block - y.block); writeFileSync(bp, JSON.stringify(B));
    const bal = BigInt(await rpc("eth_getBalance", [FEEW, "latest"]));
    writeFileSync(`${dir}/buyback.json`, JSON.stringify({ kind: "reinpay-buyback", version: 1, chainId: 4663, feeWallet: FEEW, feeBps: 20, at: new Date().toISOString(), balance: bal.toString(), buybacks: B.buybacks }));
    console.log("buyback tracker", B.buybacks.length, "buybacks, fee wallet", Number(bal) / 1e18, "ETH");
  } catch (e) { console.log("buyback skipped:", e.message); }
  try { await markets(); } catch (e) { console.log("markets skipped:", e.message); }
}

// Reinpay Trading Desk markets: for each market, the price in USDG from a real KyberSwap quote on Robinhood Chain (every run),
// the cost of a 1,000 USDG round trip and the price move at 10,000 USDG (both from real quotes), and hourly candles of the
// market's deepest Robinhood Chain pool from GeckoTerminal (on-chain swaps), refreshed once an hour. Paper trading only.
async function markets() {
  const K = "https://aggregator-api.kyberswap.com/robinhood/api/v1", G = "https://api.geckoterminal.com/api/v2/networks/robinhood", H = { "x-client-id": "reinpay" };
  const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", ETHN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const LIST = [["ETH", "Ether", ETHN, 18, "0x0bd7d308f8e1639fab988df18a8011f41eacad73"], ["BTC", "Bitcoin (cbBTC)", "0xcec185eb182c47d1ba1efc84e6959e18cd620be4", 8], ["NVDA", "NVIDIA", "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", 18], ["TSLA", "Tesla", "0x322f0929c4625ed5bad873c95208d54e1c003b2d", 18],
    ["AAPL", "Apple", "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", 18], ["AMZN", "Amazon", "0x12f190a9f9d7d37a250758b26824b97ce941bf54", 18], ["GOOGL", "Alphabet", "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", 18], ["META", "Meta", "0xc0d6457c16cc70d6790dd43521c899c87ce02f35", 18],
    ["MSFT", "Microsoft", "0xe93237c50d904957cf27e7b1133b510c669c2e74", 18], ["SPY", "S&P 500 ETF", "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", 18], ["QQQ", "Nasdaq 100 ETF", "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68", 18], ["GLD", "Gold ETF", "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e", 18],
    ["MSTR", "Strategy", "0xec262a75e413fafd0df80480274532c79d42da09", 18], ["COIN", "Coinbase", "0x6330d8c3178a418788df01a47479c0ce7ccf450b", 18], ["REINPAY", "Reinpay", TOKEN, 18]];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = async (a, b, amt) => { for (let k = 1; k <= 3; k++) { try { const j = await (await fetch(`${K}/routes?tokenIn=${a}&tokenOut=${b}&amountIn=${amt}`, { headers: H })).json(); if (j.code === 0) return j.data.routeSummary; } catch {} await sleep(800 * k); } return null; };
  const gk = async (path) => { for (let k = 1; k <= 4; k++) { try { const r = await fetch(G + path, { headers: { accept: "application/json" } }); if (r.status === 429) { await sleep(15000 * k); continue; } const j = await r.json(); if (j.data) return j.data; } catch {} await sleep(3000); } return null; };
  const mp = `${dir}/markets.json`, prev = existsSync(mp) ? JSON.parse(readFileSync(mp, "utf8")) : { markets: [] }, byS = new Map(prev.markets.map((m) => [m.s, m]));
  const now = Math.floor(Date.now() / 1000), out = [];
  for (const [s, n, a, dec, wrapped] of LIST) {
    const m = byS.get(s) || { s, n, a, dec, ticks: [], hourly: [] }; Object.assign(m, { n, a, dec });
    const one = 10n ** BigInt(dec);
    const buy = await q(USDG, a, (1000n * 10n ** 6n).toString()); await sleep(250);
    if (buy) { const got = BigInt(buy.amountOut), px = 1000 / (Number(got) / Number(one)); m.px = +px.toPrecision(8);
      const back = await q(a, USDG, got.toString()); await sleep(250); if (back) m.cost = +((1 - Number(back.amountOut) / 1e9) * 100).toFixed(3);
      const big = await q(USDG, a, (10000n * 10n ** 6n).toString()); await sleep(250); if (big) m.impact10k = +(((10000 / (Number(BigInt(big.amountOut)) / Number(one))) / px - 1) * 100).toFixed(3);
      m.route = [...new Set(buy.route.flat().map((h) => h.pool))].slice(0, 3);
      m.ticks.push([now, m.px]); m.ticks = m.ticks.filter((t) => now - t[0] <= 7 * 86400); }
    // hourly candles of the deepest pool, refreshed when the last candle is more than an hour old
    if (!m.hourly.length || now - m.hourly.at(-1)[0] > 3600) {
      const ta = (wrapped || a).toLowerCase();
      if (!m.pool) { const pools = await gk(`/tokens/${ta}/pools?page=1`); await sleep(2500); if (pools && pools.length) { const major = pools.filter((x) => /(^|\/ )(USDG|WETH)( |$)/.test(x.attributes.name)), top = (major.length ? major : pools).slice().sort((x, y) => +y.attributes.reserve_in_usd - +x.attributes.reserve_in_usd)[0]; m.pool = top.attributes.address; m.poolName = top.attributes.name; } }
      if (m.pool) { const o = await gk(`/pools/${m.pool}/ohlcv/hour?aggregate=1&limit=168&currency=usd&token=${ta}`); await sleep(2500);
        if (o && o.attributes && o.attributes.ohlcv_list) m.hourly = o.attributes.ohlcv_list.map((c) => [c[0], +(+c[1]).toPrecision(8), +(+c[2]).toPrecision(8), +(+c[3]).toPrecision(8), +(+c[4]).toPrecision(8), Math.round(c[5])]).sort((x, y) => x[0] - y[0]); }
    }
    out.push(m);
  }
  writeFileSync(mp, JSON.stringify({ kind: "reinpay-markets", version: 1, chainId: 4663, quote: "USDG", at: new Date().toISOString(), sources: { price: "KyberSwap aggregator quotes on Robinhood Chain", candles: "GeckoTerminal hourly OHLCV of each market's deepest Robinhood Chain pool" }, markets: out }));
  console.log("markets", out.map((m) => `${m.s}:${m.px ?? "-"}/${m.hourly.length}h`).join(" "));
}
