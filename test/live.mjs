// Live test on Robinhood Chain mainnet (chain id 4663). Reads and eth_simulateV1 only: nothing is ever signed or sent.
// A throwaway wallet gets a pretend ETH balance inside the simulation; public, unrelated addresses are used for transfers.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePrivateKey } from "viem/accounts";
import { parseEther, parseAbiItem, erc20Abi, getAddress } from "viem";

process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-live-"));
const home = process.env.REINPAY_HOME;
const K = await import("../src/keystore.js");
const me = K.writeKeystore(generatePrivateKey(), "throwaway-test-passphrase");
const { publicClient, TOKENS, CHAIN_ID } = await import("../src/chain.js");
const C = await import("../src/config.js");
const P = await import("../src/pay.js");
const S = await import("../src/simulate.js");

let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const c = publicClient();
const DEAD = getAddress("0x000000000000000000000000000000000000dEaD");
const OTHER = getAddress("0x00000000000000000000000000000000DeaDBeef");

// ---- chain and token facts ----
check(`chain id is ${CHAIN_ID}`, (await c.getChainId()) === CHAIN_ID);
const U = TOKENS.USDG.address;
const [sym, dec, code] = await Promise.all([c.readContract({ address: U, abi: erc20Abi, functionName: "symbol" }), c.readContract({ address: U, abi: erc20Abi, functionName: "decimals" }), c.getCode({ address: U })]);
check(`USDG ${U}: symbol ${sym}, ${dec} decimals, has code`, sym === "USDG" && dec === 6 && code && code.length > 2);

// ---- simulations from a real public USDG holder (found from recent Transfer logs) ----
const head = await c.getBlockNumber();
const logs = await c.getLogs({ address: U, event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"), fromBlock: head - 1_500n, toBlock: head });
let holder = null, hbal = 0n;
for (const to of [...new Set(logs.map((l) => l.args.to))].slice(-60)) {
  const cd = await c.getCode({ address: to });
  if (cd && cd !== "0x") continue;
  const b = await c.readContract({ address: U, abi: erc20Abi, functionName: "balanceOf", args: [to] });
  if (b >= 2_000_000n) { holder = to; hbal = b; break; }
}
check(`found a public wallet holding at least 2 USDG (${holder})`, !!holder);
const one = 1_000_000n;
const s1 = await S.simulate(holder, P.buildTx("USDG", DEAD, one));
check("simulated 1 USDG transfer: exactly one outflow, to the payee, of 1 USDG", S.mismatch(s1, { tokenAddress: U, to: DEAD, amount: one }) === null, `block ${s1.block}, gas ${s1.gasUsed}`);
check("the same simulation refuses a different payee", S.mismatch(s1, { tokenAddress: U, to: OTHER, amount: one }) !== null);
check("the same simulation refuses a different amount", S.mismatch(s1, { tokenAddress: U, to: DEAD, amount: one + 1n }) !== null);
check("the same simulation refuses a different token (ETH)", S.mismatch(s1, { tokenAddress: null, to: DEAD, amount: one }) !== null);
const sTooMuch = await S.simulate(holder, P.buildTx("USDG", DEAD, hbal + 1n));
check("a transfer above the holder's balance fails in simulation", !sTooMuch.ok && /fail/.test(S.mismatch(sTooMuch, { tokenAddress: U, to: DEAD, amount: hbal + 1n })));

// ---- the payment flow with a throwaway wallet (pretend 1 ETH, only inside the simulation and the balance read) ----
const realGetBalance = c.getBalance.bind(c);
c.getBalance = async (a) => (getAddress(a.address) === getAddress(me) ? parseEther("1") : realGetBalance(a));
S._setTestOverrides((from) => (getAddress(from) === getAddress(me) ? { [me]: { balance: "0xde0b6b3a7640000" } } : undefined));
await P.addPayee({ name: "Test payee", address: DEAD, note: "public burn address" });
await P.addPayee({ name: "USDG only", address: OTHER, tokens: ["USDG"] });
const rq = (payee, amount, token = "ETH", memo = "live test") => P.requestPayment({ payee, amount, token, memo }, { by: "test" });

const r1 = await rq("Test payee", "0.0005");
check("0.0005 ETH inside the rules: simulated on mainnet, then waits because autosend is off", r1.status === "ready" && r1.simulation?.ok && /autoSend is off/.test(r1.reason), r1.simulation && `block ${r1.simulation.block}, fee ~${r1.simulation.estimatedFeeEth} ETH`);
const nBefore = (await import("../src/receipts.js")).allReceipts().length;
const pv = await P.previewPayment({ payee: "Test payee", amount: "0.0004", token: "ETH" });
check("dry run: simulated on mainnet, would wait for the owner, and nothing was recorded", pv.dryRun && pv.wouldBe === "ready" && pv.simulation?.ok && (await import("../src/receipts.js")).allReceipts().length === nBefore, pv.simulation && `block ${pv.simulation.block}`);
check("the receipt the agent sees has no transaction data", r1.tx === undefined);
const pvx = await P.previewPayment({ payee: "Test payee", amount: "0.0004", token: "ETH", explain: true });
const lastx = pvx.steps?.[pvx.steps.length - 1];
check("check --explain: every rule listed, the mainnet simulation last, nothing recorded", pvx.steps?.length > 15 && lastx.rule === "simulation" && lastx.state === "pass" && /at block \d+/.test(lastx.detail) && (await import("../src/receipts.js")).allReceipts().length === nBefore, lastx && lastx.detail);
const plx = await P.previewPlan([{ payee: "Test payee", amount: "0.0004", token: "ETH" }, { payee: "Test payee", amount: "0.0004", token: "ETH" }]);
check("check --plan: the first simulated on mainnet, the repeat held, nothing recorded", plx.payments[0].simulation?.ok && plx.payments[1].rule === "repeat guard" && (await import("../src/receipts.js")).allReceipts().length === nBefore, plx.payments[0].simulation && `block ${plx.payments[0].simulation.block}`);
const tdy = await P.todayView();
check("today: balances read from the chain and the waiting payments listed", tdy.lines.some((l) => l.includes("read from Robinhood Chain now")) && tdy.data.waiting.length >= 1, `${tdy.data.waiting.length} waiting`);
const pck = await P.checkPayeeAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
check("payee check: the USDG contract is read as a token contract and refused", pck.token === "USDG" && pck.verdict === "stop" && pck.next === null, pck.kind);
{ const { addStep } = await import("../src/payeecheck.js"); const fresh = await P.checkPayeeAddress("0x0000000000000000000000000000000000c0ffee");
  check("payee add: a fresh address read from the chain would ask the owner first", addStep(fresh) === "ask" && fresh.nonce === 0, fresh.kind); }
const r2 = await rq("Test payee", "0.0005");
check("the same payment again is held by the repeat guard", r2.status === "needs_approval" && r2.rule === "repeat guard");
const r3 = await rq("Test payee", "0.0015");
check("0.0015 ETH is above the approval line (0.001) and waits", r3.status === "needs_approval" && r3.rule === "approval line");
{ const apd = await P.approvePreview(r3.id), still = (await import("../src/receipts.js")).getReceipt(r3.id);
  check("approve --dry: the rules and a fresh mainnet simulation pass, it stops before signing, the receipt is unchanged", apd.steps.some((x) => x.rule === "simulation now" && x.ok) && still.status === "needs_approval", apd.steps.find((x) => x.rule === "simulation now")?.detail); }
const r4 = await rq("Test payee", "0.0025");
check("0.0025 ETH is above the max per payment (0.002) and is blocked", r4.status === "blocked" && r4.rule === "max per payment");
const r5 = await rq("Test payee", "0.0019");
const r6 = await rq("Test payee", "0.001");
check(`waiting payments count against the daily budget (0.005): 0.001 more is blocked (${r6.reason})`, r5.status === "needs_approval" && r6.status === "blocked" && r6.rule === "daily budget");
const rj = P.reject(r5.id);
const r7 = await rq("Test payee", "0.0009");
check("rejecting a waiting payment frees its budget", rj.status === "rejected" && r7.status === "ready");
const r8 = await rq("Somebody", "0.0001");
check("an unlisted payee is blocked", r8.status === "blocked" && r8.rule === "payee list");
const r9 = await rq("USDG only", "0.0001");
check("a USDG-only payee cannot be paid in ETH", r9.status === "blocked" && r9.rule === "payee tokens");
const r10 = await rq("Test payee", "1", "USDG");
check("a USDG payment from a wallet without USDG is blocked before signing", r10.status === "blocked" && /holds 0 USDG/.test(r10.reason));
// Approval re-checks the rules: shrink the daily budget, then approving refuses before anything is signed.
const cfg = C.loadConfig(); cfg.rules.daily.ETH = "0.0001"; C.saveConfig(cfg);
const ap = await P.approve(r1.id, { passphrase: "throwaway-test-passphrase" });
check("approve checks the budget again and refuses before signing", ap.status === "blocked" && ap.rule === "daily budget" && !ap.txHash);
cfg.rules.daily.ETH = "0.005"; cfg.rules.autoSend = true; C.saveConfig(cfg);
const r11 = await rq("Test payee", "0.0001");
check("autosend on but the wallet locked: nothing is sent, the payment waits", r11.status === "ready" && /locked/.test(r11.reason) && !r11.txHash);
cfg.rules.autoSend = false; C.saveConfig(cfg);
// 0.2.0: two requests at the same moment cannot both spend the same budget left
{
  const before = P.rulesView().tokens.ETH.leftToday;
  const [ca, cb] = await Promise.all([rq("Test payee", "0.0012", "ETH", "race a"), rq("Test payee", "0.0011", "ETH", "race b")]);
  const blocked = [ca, cb].filter((x) => x.status === "blocked" && x.rule === "daily budget");
  check(`two requests at once with ${before} left: one waits, the other is blocked by the daily budget`, blocked.length === 1 && [ca, cb].some((x) => x.status === "needs_approval"), `${ca.status}/${cb.status}`);
  P.setPayeeLimit("Test payee", "daily", "ETH", "0.004");
  const pv = P.rulesView().payees.find((x) => x.name === "Test payee");
  check(`a payee's own daily budget shows in the agent's rules (${JSON.stringify(pv.limits?.ETH)})`, pv.limits?.ETH?.dailyBudget === "0.004 ETH");
  const pd = await rq("Test payee", "0.0001", "ETH", "payee cap");
  check("a request over the payee's own daily budget is blocked by that rule", pd.status === "blocked" && pd.rule === "payee daily budget", pd.reason);
  P.setPayeeLimit("Test payee", "daily", "ETH", "off");
  check("payee limit off clears it", !P.rulesView().payees.find((x) => x.name === "Test payee").limits);
  const { spendingReport } = await import("../src/report.js");
  const { allReceipts } = await import("../src/receipts.js");
  const rep = spendingReport(allReceipts(), { days: 1 });
  check(`the report counts today's requests (ETH: ${rep.totals.ETH.waitingCount} waiting, ${rep.totals.ETH.blockedCount} blocked)`, rep.totals.ETH.waitingCount >= 3 && rep.totals.ETH.blockedCount >= 4 && rep.totals.ETH.sentCount === 0);
}
// 0.3.0: token contracts are never payees, weekly and monthly budgets, owner notifications
{
  const REINPAY_TOKEN = "0x17c4735E9da7F1eeB76d1cC17C2f196F38DE64b3";
  let e1 = ""; try { await P.addPayee({ name: "Oops token", address: REINPAY_TOKEN }); } catch (e) { e1 = e.message; }
  check(`adding a token's own contract as a payee is refused (${e1.slice(0, 70)}...)`, /contract of REINPAY/.test(e1));
  const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
  const pf = await P.addPayee({ name: "A contract that is not a token", address: PONS_FACTORY });
  check("a contract that is not a token can still be a payee (flagged as a contract)", pf.isContract === true);
  P.removePayee("A contract that is not a token");
  const cfg2 = C.loadConfig(); cfg2.payees.push({ name: "Hand edited", address: REINPAY_TOKEN }); C.saveConfig(cfg2);
  const ht = await rq("Hand edited", "0.0001");
  check("a token contract slipped into config.json by hand is blocked at payment time", ht.status === "blocked" && ht.rule === "token contract", ht.reason);
  P.removePayee("Hand edited");
  const cfg3 = C.loadConfig(); cfg3.rules.weekly = { ETH: "0.0001" }; C.saveConfig(cfg3);
  const wk = P.rulesView().tokens.ETH.weeklyBudget;
  check(`get_rules shows the weekly budget and what is left (${JSON.stringify(wk)})`, wk?.budget === "0.0001 ETH" && wk.left === "0 ETH");
  const wr = await rq("Test payee", "0.0001", "ETH", "weekly");
  check("over the weekly budget is blocked by that rule", wr.status === "blocked" && wr.rule === "weekly budget");
  delete cfg3.rules.weekly; cfg3.rules.daily.ETH = "1"; cfg3.notify = { type: "webhook", url: "https://127.0.0.1:9/reinpay-test" }; C.saveConfig(cfg3);
  const nt = await rq("Test payee", "0.0013", "ETH", "notify test");
  check(`a waiting payment tries to notify the owner and logs the result on the receipt (${nt.history.at(-1)?.note})`, nt.status === "needs_approval" && /Owner notification failed/.test(nt.history.at(-1)?.note || ""));
  check("get_rules tells the agent the owner is notified, without the webhook address", P.rulesView().ownerNotifiedBy === "webhook" && !JSON.stringify(P.rulesView()).includes("127.0.0.1"));
  P.reject(nt.id, "Test cleanup.");
  delete cfg3.notify; cfg3.rules.daily.ETH = "0.005"; C.saveConfig(cfg3);
}
// 0.4.0: extra tokens, checked on-chain and on Sourcify before they can be added
{
  const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"; // Wrapped Ether on Robinhood Chain, a public token
  const REINPAY_TOKEN = "0x17c4735E9da7F1eeB76d1cC17C2f196F38DE64b3";
  let e1 = ""; try { await P.addToken(REINPAY_TOKEN); } catch (e) { e1 = e.message; }
  check("a token that is not verified on Sourcify is refused", /not verified on Sourcify/.test(e1), e1.slice(0, 90));
  let e2 = ""; try { await P.addToken(DEAD); } catch (e) { e2 = e.message; }
  check("an address with no contract code is refused", /no contract code/.test(e2));
  let e3 = ""; try { await P.addToken("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"); } catch (e) { e3 = e.message; }
  check("USDG is already built in", /already a token/.test(e3));
  const t = await P.addToken(WETH);
  check(`WETH is added after the Sourcify check (${t.symbol}, ${t.decimals} decimals, ${t.sourcify})`, t.symbol === "WETH" && t.decimals === 18 && ["exact_match", "match"].includes(t.sourcify));
  const rv = P.rulesView().tokens.WETH;
  check("an added token has no daily budget until the owner sets one", rv && rv.dailyBudget === null);
  const w1 = await rq("Test payee", "0.0001", "WETH", "weth");
  check("so the agent cannot spend it yet", w1.status === "blocked" && w1.rule === "daily budget");
  const c4 = C.loadConfig(); c4.rules.daily.WETH = "0.001"; C.saveConfig(c4);
  const w2 = await rq("Test payee", "0.0001", "WETH", "weth");
  check("with a budget, a WETH payment is checked against the real balance and simulated (the test wallet holds none)", w2.status === "blocked" && /holds 0 WETH/.test(w2.reason), w2.reason);
  const ws = await P.walletStatus();
  check(`wallet_status reads the WETH balance too (${ws.balances.WETH})`, ws.balances.WETH === "0");
  let e4 = ""; try { await P.addPayee({ name: "WETH contract", address: WETH }); } catch (e) { e4 = e.message; }
  check("the added token's own contract is still refused as a payee", /contract of WETH/.test(e4));
  P.removeToken("WETH");
  check("removing the token takes it out of the rules", !P.rulesView().tokens.WETH);
  let e5 = ""; try { P.removeToken("USDG"); } catch (e) { e5 = e.message; }
  check("built-in tokens cannot be removed", /built in/.test(e5));
}
// 0.4.1: approve never signs data read back from receipts.json
{
  const { readFileSync, writeFileSync } = await import("node:fs");
  const rp = C.paths().receipts;
  const disk = JSON.parse(readFileSync(rp, "utf8"));
  check("no raw transaction is stored in receipts.json", disk.receipts.every((x) => x.tx === undefined && x._tx === undefined));
  const cT = C.loadConfig(); cT.rules.daily.ETH = "1"; cT.rules.weekly = {}; cT.rules.monthly = {}; C.saveConfig(cT);
  const w = await rq("Test payee", "0.0011", "ETH", "tamper test");
  check("the tamper-test payment waits for approval", w.status === "needs_approval", w.reason);
  const db = JSON.parse(readFileSync(rp, "utf8"));
  const rec = db.receipts.find((x) => x.id === w.id);
  rec.payeeAddress = "0x000000000000000000000000000000000000bEEF";
  rec.tx = { to: "0x000000000000000000000000000000000000bEEF", data: "0x", value: "1000000000000000000" };
  writeFileSync(rp, JSON.stringify(db));
  const ap2 = await P.approve(w.id, { passphrase: "throwaway-test-passphrase" });
  check("a receipt edited to point at another address is refused at approval, nothing signed", ap2.status === "blocked" && ap2.rule === "payee list" && !ap2.txHash, ap2.reason);
  // 0.5.0: a config changed outside reinpay is never signed, even when every other check passes
  const w2 = await rq("Test payee", "0.0012", "ETH", "seal test");
  const ap3 = await P.approve(w2.id, { passphrase: "throwaway-test-passphrase" });
  check("approval stops before signing when config.json is not sealed by the wallet key", ap3.rule === "config seal" && !ap3.txHash && ap3.status === "needs_approval", ap3.reason);
  const { sealConfig, checkSeal } = await import("../src/seal.js");
  const sealed = await sealConfig(C.loadConfig(), K.loadAccount("throwaway-test-passphrase")); C.saveConfig(sealed);
  check("after the owner seals, the seal verifies against the wallet", (await checkSeal(C.loadConfig(), me)).ok === true);
  const c5 = C.loadConfig(); c5.payees.push({ name: "Sneaky", address: "0x000000000000000000000000000000000000bEEF" }); C.saveConfig(c5);
  check("a payee slipped into config.json by hand breaks the seal", (await checkSeal(C.loadConfig(), me)).ok === false);
  P.reject(w2.id, "Test cleanup.");
  cT.rules.daily.ETH = "0.005"; C.saveConfig(cT);
}
let threw = "";
try { await P.approve(r8.id); } catch (e) { threw = e.message; }
check("a blocked payment cannot be approved", /only waiting payments/.test(threw));

// ---- the MCP server over stdio: the agent's view ----
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
const mcp = new Client({ name: "reinpay-live-test", version: "0.0.0" });
await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../bin/reinpay.js", import.meta.url)), "mcp"], env: { ...process.env, REINPAY_HOME: home } }));
const names = (await mcp.listTools()).tools.map((t) => t.name).sort();
check(`the agent gets 11 tools (${names.join(", ")})`, names.join() === "check_payment,freeze_wallet,get_receipt,get_rules,list_receipts,read_payment_link,request_payment,review_rules,spending_report,verify_receipt,wallet_status");
check("no tool can approve, reject or change rules or payees", !names.some((n) => /approve|reject|rule_set|payee|unlock|autosend/.test(n)));
const call = async (name, args = {}) => { const r = await mcp.callTool({ name, arguments: args }); return { err: !!r.isError, text: r.content.map((x) => x.text).join("") }; };
const rules = JSON.parse((await call("get_rules")).text);
check("get_rules lists the payees and today's ETH budget", rules.payees.length === 2 && /ETH$/.test(rules.tokens.ETH.dailyBudget));
const st = JSON.parse((await call("wallet_status")).text);
check(`wallet_status reads real balances (the throwaway wallet holds ${st.balances.ETH} ETH)`, st.address === me && st.balances.ETH === "0");
const m1 = JSON.parse((await call("request_payment", { payee: "Not on list", amount: "1", memo: "x" })).text);
check("request_payment to an unlisted payee is blocked over MCP", m1.status === "blocked" && m1.rule === "payee list");
const m2 = JSON.parse((await call("request_payment", { payee: "Test payee", amount: "0.0001", token: "ETH", memo: "real balance" })).text);
check("over MCP, with the real (empty) balance, the payment is blocked before signing", m2.status === "blocked" && m2.rule === "simulation");
const m3 = await call("request_payment", { payee: "Test payee", amount: "1e3", memo: "x" });
check("a malformed amount is refused", m3.err && /positive decimal/.test(m3.text));
const list = JSON.parse((await call("list_receipts", { limit: 5 })).text);
check("list_receipts returns the newest first", list.length === 5 && list[0].id === m2.id);
const one2 = JSON.parse((await call("get_receipt", { id: r1.id })).text);
check("get_receipt shows the history of an approval that was refused", one2.history.some((h) => /Approval refused/.test(h.note)));
const spr = JSON.parse((await call("spending_report", { days: 1 })).text);
check("spending_report over MCP: today's requests per token", spr.days === 1 && !!spr.totals.ETH, JSON.stringify(spr.totals.ETH));
const rvw = JSON.parse((await call("review_rules", {})).text);
check("review_rules over MCP: returns suggestions, each with a command", Array.isArray(rvw) && rvw.every((x) => x.fix && x.title), `${rvw.length} suggestions`);
const mv = JSON.parse((await call("verify_receipt", { id: r1.id })).text);
check("verify_receipt over MCP: a receipt that was never sent has nothing to check", mv.ok === false && /nothing was sent/.test(mv.reason));
const cp = JSON.parse((await call("check_payment", { payee: "Test payee", amount: "0.0001", token: "ETH" })).text);
check("check_payment over MCP: with the real (empty) balance it says the payment would be blocked in simulation", cp.dryRun && cp.wouldBe === "blocked" && cp.rule === "simulation");
const fzr = JSON.parse((await call("freeze_wallet", { reason: "live test: the agent pulls the brake" })).text);
check("freeze_wallet over MCP: the agent can pull the brake", fzr.frozen?.by === "agent");
const afterFz = JSON.parse((await call("request_payment", { payee: "Test payee", amount: "0.0001", token: "ETH", memo: "after freeze" })).text);
check("after the agent froze it, its own next request is blocked as frozen", afterFz.status === "blocked" && afterFz.rule === "frozen");
check("no MCP tool can unfreeze", !names.some((n) => /unfreeze/.test(n)));
await mcp.close();

// ---- 0.6: verify real public payments, doctor against the real RPC, lookalike guard ----
const V = await import("../src/verify.js");
// Real public payments from the last few hundred blocks: a direct ERC-20 transfer() call (any token) and a plain ETH payment.
let real = null, ethTx = null;
const TT = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
for (let b = head; b > head - 1500n && (!real || !ethTx); b--) {
  const blk = await c.getBlock({ blockNumber: b, includeTransactions: true });
  for (const t of blk.transactions) {
    if (!ethTx && t.to && t.input === "0x" && t.value > 0n) ethTx = t;
    if (real || !t.to || t.value !== 0n || !t.input.startsWith("0xa9059cbb") || t.input.length !== 138) continue;
    const rc = await c.getTransactionReceipt({ hash: t.hash });
    const outs = rc.logs.filter((x) => getAddress(x.address) === getAddress(t.to) && x.topics[0] === TT && x.topics[1]?.toLowerCase() === "0x" + t.from.slice(2).toLowerCase().padStart(64, "0"));
    if (rc.status !== "success" || outs.length !== 1) continue;
    real = { id: "RP-PUBLIC", status: "sent", token: "TOKEN", tokenAddress: getAddress(t.to), txHash: t.hash, wallet: getAddress(t.from),
      payeeAddress: getAddress("0x" + outs[0].topics[2].slice(26)), amountRaw: BigInt(outs[0].data).toString(), block: String(rc.blockNumber) };
  }
}
check("found a recent public ERC-20 transfer to check", !!real, real && `${real.txHash} on ${real.tokenAddress}`);
const v1 = await V.verifyReceipt(real);
check("verify: that real token transfer matches a receipt written from it", v1.ok, `${v1.checks.length} checks, block ${real.block}`);
check("verify: the same transaction with a different payee does not match", !(await V.verifyReceipt({ ...real, payeeAddress: OTHER })).ok);
check("verify: one unit more than was paid does not match", !(await V.verifyReceipt({ ...real, amountRaw: (BigInt(real.amountRaw) + 1n).toString() })).ok);
check("verify: another wallet as the sender does not match", !(await V.verifyReceipt({ ...real, wallet: OTHER })).ok);
check("verify: another token contract does not match", !(await V.verifyReceipt({ ...real, tokenAddress: getAddress(real.tokenAddress) === U ? OTHER : U })).ok);
check("verify: called ETH instead of the token does not match", !(await V.verifyReceipt({ ...real, token: "ETH" })).ok);
if (ethTx) {
  const erc = await c.getTransactionReceipt({ hash: ethTx.hash });
  const rEth = { id: "RP-PUBLIC-ETH", status: "sent", token: "ETH", txHash: ethTx.hash, wallet: ethTx.from, payeeAddress: ethTx.to, amountRaw: ethTx.value.toString(), block: String(erc.blockNumber) };
  const ve = await V.verifyReceipt(rEth);
  check(`verify: a real plain ETH payment matches (${erc.status})`, ve.ok === (erc.status === "success"), ethTx.hash);
  check("verify: that ETH payment with a different amount does not match", !(await V.verifyReceipt({ ...rEth, amountRaw: "1" })).ok);
} else check("found a recent plain ETH payment", false);
check("verify: a made-up transaction hash does not match and does not throw", !(await V.verifyReceipt({ ...real, txHash: "0x" + "ab".repeat(32) })).ok);

// ---- 0.8: a signed statement checked against the same real public payment ----
const ST = await import("../src/statement.js");
const { privateKeyToAccount } = await import("viem/accounts");
const stranger = privateKeyToAccount(generatePrivateKey());
const pubRec = { ...real, by: "agent", createdAt: Date.now(), payee: "Public payee", amount: "x" };
const stPub = ST.buildStatement([pubRec], { wallet: real.wallet, days: 1 });
const stPubSigned = { ...stPub, signature: { by: stranger.address, sig: await stranger.signMessage({ message: ST.statementMessage(stPub) }) } };
const cPub = await ST.checkStatement(stPubSigned);
check("statement check: the real payment in it matches the chain", cPub.payments.length === 1 && cPub.payments[0].ok);
check("statement check: but it was not signed by that wallet, so the statement fails", !cPub.ok && !cPub.signature.ok && /not by the wallet/.test(cPub.signature.reason));
const stMine = ST.buildStatement([pubRec], { wallet: stranger.address, days: 1 });
const cMine = await ST.checkStatement(await ST.signStatement(stMine, stranger));
check("statement check: signed by its wallet, but claiming someone else's payment, fails on the chain", cMine.signature.ok && !cMine.ok && cMine.payments[0].failed.includes("sent from your wallet"));

// ---- 0.10: read-only MCP and a signed payee list ----
const ro = new Client({ name: "reinpay-live-test-ro", version: "0.0.0" });
await ro.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../bin/reinpay.js", import.meta.url)), "mcp", "--read-only"], env: { ...process.env, REINPAY_HOME: home } }));
const roNames = (await ro.listTools()).tools.map((t) => t.name).sort();
check(`read-only MCP: ${roNames.length} tools, no request_payment`, roNames.length === 10 && !roNames.includes("request_payment"), roNames.join(", "));
const roTry = await ro.callTool({ name: "request_payment", arguments: { payee: "Test payee", amount: "0.0001", token: "ETH", memo: "x" } }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));
check("read-only MCP: asking for a payment is refused", !!roTry.isError);
await ro.close();
const SH = await import("../src/payeeshare.js");
const lister = privateKeyToAccount(generatePrivateKey());
const shared = await SH.exportPayees([{ name: "Shared burn", address: getAddress("0x000000000000000000000000000000000000dEaD") }, { name: "USDG contract", address: U }], lister);
const sp = SH.planImport(shared, C.loadConfig().payees, me);
check("payee import: the burn address is already on the list, so it is skipped", sp.skip.some((x) => x.name === "Shared burn"));
let tokErr = null; for (const p of sp.add) { try { await P.addPayee(p); } catch (e) { tokErr = e; } }
check("payee import: a token contract in a shared list is still refused on mainnet", /contract of USDG/.test(tokErr?.message || ""), tokErr?.message?.slice(0, 60));

const D = await import("../src/doctor.js");
const dr = await D.doctor();
const dget = (n) => dr.find((x) => x.name === n);
check("doctor: the real RPC answers and is chain 4663", dget("rpc").level === "ok" && dget("chain").level === "ok", dget("rpc").detail);
check("doctor: reads the gas price and the (pretend 1 ETH) balance", dget("gas money").level === "ok", dget("gas money").detail);
check("doctor: 10 checks", dr.length === 10, dr.map((x) => `${x.name}:${x.level}`).join(" "));

const FAKE_DEAD = "0x0000" + "1".repeat(32) + "dead";
let le = null; try { await P.addPayee({ name: "Lookalike", address: FAKE_DEAD }); } catch (e) { le = e; }
check("payee add refuses an address that starts and ends like the burn address payee", le?.code === "LOOKALIKE");
const lp = await P.addPayee({ name: "Lookalike", address: FAKE_DEAD, allowLookalike: true });
check("after the owner confirms, it is added and marked as confirmed", lp.lookalikeConfirmed === "Test payee");
check("doctor: the brakes line shows the freeze the agent made", dr.find((x) => x.name === "brakes").level === "warn" && /agent/.test(dr.find((x) => x.name === "brakes").detail));
(await import("../src/freeze.js")).unfreeze();
check("doctor: shows the confirmed lookalike as something to look at", (await D.doctor()).find((x) => x.name === "payees").level === "warn");

// ---- 0.11: a category budget on the real payment path ----
P.setPayee("USDG only", { category: "compute" });
{ const c0 = C.loadConfig(); c0.rules.categories = { compute: { daily: { USDG: "2" } } }; C.saveConfig(c0); }
const cb = await rq("USDG only", "3", "USDG", "category test");
check("category budget: 3 USDG to a compute payee with a 2 USDG compute budget is blocked", cb.status === "blocked" && cb.rule === "category budget" && cb.category === "compute", `${cb.rule}: ${cb.reason}`);
const cs = await rq("USDG only", "1", "USDG", "category test");
check("inside the compute budget, the rules let it through to the mainnet simulation (blocked there: the test wallet holds no USDG)", cs.rule === "simulation", `${cs.rule}: ${cs.reason}`);

// ---- 0.12: a payment link and a scheduled payment on the real payment path ----
{ const c0 = C.loadConfig(); delete c0.rules.categories; C.saveConfig(c0); }
const LK = await import("../src/paylink.js");
const lk = LK.readLink(LK.makeLink(DEAD, "ETH", 400000000000000n), C.loadConfig());
check("payment link: an ETH link to the burn address resolves to the listed payee", lk.onList && lk.payee === "Test payee" && lk.amount === "0.0004");
const lr = await P.requestPayment({ payee: lk.payee, amount: lk.amount, token: lk.token, memo: "payment link" }, { by: "owner" });
check("payment link: the request goes through the rules and the mainnet simulation", ["ready", "needs_approval", "blocked"].includes(lr.status) && !!lr.rule, `${lr.status}: ${lr.rule}`);
const mcpLink = await (async () => { const cl = new Client({ name: "reinpay-live-link", version: "0.0.0" }); await cl.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../bin/reinpay.js", import.meta.url)), "mcp"], env: { ...process.env, REINPAY_HOME: home } })); const r = await cl.callTool({ name: "read_payment_link", arguments: { link: LK.makeLink(OTHER, "USDG", 1000000n) } }); await cl.close(); return JSON.parse(r.content[0].text); })();
check("read_payment_link over MCP: reads the link and names the payee, pays nothing", mcpLink.payee === "USDG only" && mcpLink.amount === "1" && mcpLink.token === "USDG");
const SC = await import("../src/schedule.js");
const sch = SC.newSchedule({ payee: "Test payee", amount: "0.0001", token: "ETH", every: "daily", start: new Date(Date.now() - 60000).toISOString() });
const sst = {}; check("schedule: a schedule that started a minute ago is due", SC.due([sch], sst).length === 1);
SC.advance(sch, sst);
const sr = await P.requestPayment({ payee: sch.payee, amount: sch.amount, token: sch.token, memo: `${sch.id} daily` }, { by: "schedule" });
check("schedule: its payment goes through the rules like any other, and is not due again today", !!sr.rule && SC.due([sch], sst).length === 0, `${sr.status}: ${sr.rule}`);
// ---- 0.15: USD rules with the real two-pool ETH price ----
const PRC = await import("../src/price.js");
const ep = await PRC.ethPrice();
check(`ETH price from two WETH/USDG pools on mainnet (${ep.price?.toFixed(2)} USDG)`, ep.price > 100 && ep.price < 100000 && ep.pools.every((x) => x.price), JSON.stringify(ep.pools.map((x) => x.price)));
{ const c0 = C.loadConfig(); c0.rules.usd = { max: "0.5" }; c0.rules.repeatGuardMinutes = 0; c0.rules.daily = { ...c0.rules.daily, ETH: "1" }; c0.rules.weekly = {}; c0.rules.maxPerPayment = { ...c0.rules.maxPerPayment, ETH: "0.01" }; C.saveConfig(c0); }
const ub = await rq("Test payee", "0.0004", "ETH", "usd test");
check("usd max 0.5: 0.0004 ETH (about 0.72 USD) is blocked, with its value", ub.status === "blocked" && ub.rule === "usd max" && Number(ub.usdValue) > 0.5, `${ub.rule}: ${ub.usdValue} USD at ${ub.ethPriceUsdg}`);
const uok = await rq("Test payee", "0.0001", "ETH", "usd test");
check("usd max 0.5: 0.0001 ETH (about 0.18 USD) passes the USD rule and gets its value on the receipt", uok.rule !== "usd max" && uok.rule !== "usd price" && Number(uok.usdValue) > 0, `${uok.rule}: ${uok.usdValue} USD`);
{ const c0 = C.loadConfig(); delete c0.rules.usd; C.saveConfig(c0); }

// ---- 0.18: the sandbox, on mainnet, in its own folder ----
{ const homeBefore = process.env.REINPAY_HOME;
  const SB = await import("../src/sandbox.js");
  const sb = await SB.runSandbox({ log: () => {} });
  check("sandbox: five requests, real rules, real simulation: ready, repeat, approval line, max, payee list", sb.map((r) => r.rule).join() === "within rules,repeat guard,approval line,max per payment,payee list" && !!sb[0].simulation?.block, sb.map((r) => r.status).join());
  check("sandbox: puts REINPAY_HOME back and does not touch the test wallet", process.env.REINPAY_HOME === homeBefore && C.loadConfig().payees.some((p) => p.name === "Test payee") && typeof S._getTestOverrides() === "function"); }

// ---- 0.21: a session budget on a real MCP server run ----
{ const ss = new Client({ name: "reinpay-live-session", version: "0.0.0" });
  await ss.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../bin/reinpay.js", import.meta.url)), "mcp", "--session=ETH:0.0003"], env: { ...process.env, REINPAY_HOME: home } }));
  const gr = JSON.parse((await ss.callTool({ name: "get_rules", arguments: {} })).content[0].text);
  const sb = JSON.parse((await ss.callTool({ name: "request_payment", arguments: { payee: "Test payee", amount: "0.0004", token: "ETH", memo: "session test" } })).content[0].text);
  await ss.close();
  check("session budget over MCP: get_rules shows the cap, and 0.0004 ETH in a 0.0003 ETH session is blocked", gr.thisSession?.caps?.ETH === "0.0003" && sb.status === "blocked" && sb.rule === "session budget" && /^S-/.test(sb.session), `${sb.rule}`); }

// ---- 0.25: max network fee against the real gas price ----
{ const c0 = C.loadConfig(); c0.rules.maxFeeEth = "0.000000000000000001"; c0.rules.repeatGuardMinutes = 0; C.saveConfig(c0); }
const mf = await rq("Test payee", "0.0001", "ETH", "fee test");
check("max fee of 1 wei: the real mainnet fee is above it, so the payment is blocked by the network fee rule", mf.status === "blocked" && mf.rule === "network fee", mf.reason);
{ const c0 = C.loadConfig(); delete c0.rules.maxFeeEth; C.saveConfig(c0); }

console.log(`\n${pass} passed, ${fail} failed. No transaction was signed or sent.`);
process.exit(fail ? 1 : 0);
