// Payment links, scheduled payments and budget alerts, offline.
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-bills-"));
const L = await import("../src/paylink.js");
const S = await import("../src/schedule.js");
const C = await import("../src/config.js");
const K = await import("../src/keystore.js");
const P = await import("../src/pay.js");
const RC = await import("../src/receipts.js");
const { sealMessage, sealConfig, checkSeal } = await import("../src/seal.js");
await import("../src/chain.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const DEAD = "0x000000000000000000000000000000000000dEaD", BEEF = "0x00000000000000000000000000000000DeaDBeef", USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const cfg = { ...C.DEFAULT_CONFIG, payees: [{ name: "Burn", address: DEAD }, { name: "Off", address: BEEF, disabled: true }] };

// links
const usdLink = `ethereum:${USDG}@4663/transfer?address=${DEAD}&uint256=2500000`;
const r1 = L.readLink(usdLink, cfg);
check("USDG transfer link: payee, token and amount", r1.onList && r1.payee === "Burn" && r1.token === "USDG" && r1.amount === "2.5" && !r1.problem);
const r2 = L.readLink(`ethereum:${DEAD}@4663?value=1e15`, cfg);
check("ETH link with 1e15 wei reads as 0.001 ETH", r2.token === "ETH" && r2.amount === "0.001" && r2.onList);
check("a link without a chain id is read as Robinhood Chain", L.readLink(`ethereum:${DEAD}?value=1000`, cfg).chainId === 4663);
let e = null; try { L.readLink(`ethereum:${DEAD}@1?value=1000`, cfg); } catch (x) { e = x; }
check("a link for another chain is refused", /not Robinhood Chain/.test(e?.message || ""));
const r3 = L.readLink(`ethereum:${USDG}@4663/transfer?address=0x0000000000000000000000000000000000000007&uint256=1`, cfg);
check("a payee not on the list is reported, not paid", !r3.onList && /not on your payee list/.test(r3.problem));
check("a switched-off payee is reported", /switched off/.test(L.readLink(`ethereum:${BEEF}@4663?value=1`, cfg).problem));
check("an unknown token is reported", /not one Reinpay spends/.test(L.readLink(`ethereum:0x0000000000000000000000000000000000000009@4663/transfer?address=${DEAD}&uint256=1`, cfg).problem));
for (const [bad, why] of [["https://example.com", "not a link"], [`ethereum:${USDG}/approve?address=${DEAD}&uint256=1`, "approve is refused"], [`ethereum:${DEAD}@4663`, "no amount"], [`ethereum:${DEAD}@4663?value=1.5`, "fractional wei"]]) {
  e = null; try { L.readLink(bad, cfg); } catch (x) { e = x; } check(`refused: ${why}`, !!e);
}
check("makeLink and readLink agree", L.readLink(L.makeLink(DEAD, "USDG", 7_000_000n), cfg).amount === "7");

// schedules
const s = S.newSchedule({ payee: "Burn", amount: "5", token: "USDG", every: "weekly", start: "2026-11-02T09:00:00" });
check("a schedule has an id, a start and no run state inside it", /^SC-[0-9A-F]{6}$/.test(s.id) && !!s.start && !("next" in s));
check("weekly, monthly and daily cadences", new Date(S.nextAfter("2026-11-02T09:00:00", "weekly")).getDate() === 9 && new Date(S.nextAfter("2026-01-31T09:00:00", "monthly")).getDate() === 28 && new Date(S.nextAfter("2026-11-02T09:00:00", "daily")).getDate() === 3);
const st = {}, at = Date.parse("2026-11-02T10:00:00");
check("due at its start", S.due([s], st, at).length === 1 && S.due([s], st, Date.parse("2026-11-02T08:00:00")).length === 0);
const adv = S.advance(s, st, at);
check("after a run it is not due again in the same slot", S.due([s], st, at).length === 0 && new Date(adv.next).getDate() === 9);
const late = S.advance(s, st, Date.parse("2026-11-30T10:00:00"));
check("missed slots are skipped, never paid as a backlog", late.skipped === 3 && new Date(late.next).getDate() === 7);
check("a paused schedule is never due", S.due([{ ...s, paused: true }], {}, at).length === 0);
for (const [args, why] of [[{ payee: "Burn", amount: "5", token: "USDG", every: "hourly" }, "bad cadence"], [{ payee: "Burn", amount: "five", token: "USDG", every: "daily" }, "bad amount"], [{ payee: "Burn", amount: "5", token: "USDG", every: "daily", start: "soon" }, "bad start"]]) {
  e = null; try { S.newSchedule(args); } catch (x) { e = x; } check(`schedule refused: ${why}`, !!e);
}
const owner = privateKeyToAccount(generatePrivateKey());
const sealed = await sealConfig({ ...cfg, schedules: [s] }, owner);
check("schedules are sealed: editing an amount breaks the seal", !(await checkSeal({ ...sealed, schedules: [{ ...s, amount: "500" }] }, owner.address)).ok && (await checkSeal(sealed, owner.address)).ok);
check("a config with no schedules seals exactly as before", sealMessage({ ...cfg, schedules: [] }) === sealMessage(cfg));
S.saveState({ [s.id]: { next: "2026-12-01T09:00:00.000Z" } });
check("run state lives in its own file, outside the seal", S.nextOf(s) === "2026-12-01T09:00:00.000Z" && (await checkSeal(sealed, owner.address)).ok);

// budget alerts
const pk = generatePrivateKey(); const me = K.writeKeystore(pk, "throwaway-test-passphrase");
const sent = [];
const fakeFetch = async (url, o) => { sent.push(JSON.parse(o.body)); return { ok: true, status: 200 }; };
const acfg = { ...C.DEFAULT_CONFIG, rules: { ...C.DEFAULT_CONFIG.rules, daily: { USDG: 25 } }, notify: { type: "webhook", url: "https://example.com/h", alertAt: 80 }, payees: [] };
const add = (usdg) => RC.addReceipt({ by: "agent", wallet: me, payee: "Burn", payeeAddress: DEAD, token: "USDG", amount: String(usdg), amountRaw: String(usdg * 1_000_000), status: "sent" });
add(10);
check("at 40% no alert", (await P.budgetAlert(acfg, "USDG", { fetch: fakeFetch })) === null && sent.length === 0);
add(11);
const a1 = await P.budgetAlert(acfg, "USDG", { fetch: fakeFetch });
check("at 84% one alert, saying how much is used", a1?.ok && sent.length === 1 && /84% of today's USDG budget/.test(sent[0].text) && sent[0].event === "budget_alert", sent[0]?.text?.split("\n")[0]);
add(1);
check("only one alert per token per day", (await P.budgetAlert(acfg, "USDG", { fetch: fakeFetch })) === null && sent.length === 1);
check("alerts off: nothing", (await P.budgetAlert({ ...acfg, notify: { type: "webhook", url: "https://example.com/h" } }, "ETH", { fetch: fakeFetch })) === null);
check("the alert record is kept in alerts.json", existsSync(join(C.HOME(), "alerts.json")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
