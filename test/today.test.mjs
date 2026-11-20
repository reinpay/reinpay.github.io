// v0.33: reinpay today, offline (the balances are passed in).
import { parseUnits } from "viem";
import { today, bar } from "../src/today.js";
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const NOW = Date.parse("2026-11-20T12:00:00"), eth = (x) => parseUnits(String(x), 18).toString();
const cfg = { rules: { daily: { USDG: 25, ETH: 0.005 }, maxPerPayment: { USDG: 10, ETH: 0.002 }, approveAbove: { USDG: 5, ETH: 0.001 } } };
const R = (o) => ({ id: "RP-00001", payee: "Weather API", payeeAddress: "0x000000000000000000000000000000000000dEaD", token: "ETH", amount: "0.0005", amountRaw: eth("0.0005"), createdAt: NOW - 600_000, status: "ready", rule: "within rules", ...o });
const receipts = [
  R({}),
  R({ id: "RP-00002", amount: "0.0015", amountRaw: eth("0.0015"), status: "needs_approval", rule: "approval line", payee: "GPU credits" }),
  R({ id: "RP-00003", amount: "0.001", amountRaw: eth("0.001"), status: "sent", createdAt: NOW - 7_200_000 }),
  R({ id: "RP-00004", amount: "0.003", amountRaw: eth("0.003"), status: "blocked", rule: "max per payment" }),
  R({ id: "RP-00005", amount: "0.0001", amountRaw: eth("0.0001"), status: "blocked", rule: "payee list" }),
  R({ id: "RP-00006", amount: "0.004", amountRaw: eth("0.004"), status: "sent", createdAt: NOW - 86_400_000 * 2 }),
];
const t = today({ cfg, receipts, balances: { ETH: 10n ** 18n, USDG: 0n }, now: NOW });
const ethLine = t.lines.find((l) => l.trim().startsWith("ETH"));
check("ETH: sent, waiting and left add up to the daily budget (old payments do not count)", t.data.tokens.ETH.sent === "0.001" && t.data.tokens.ETH.waiting === "0.002" && t.data.tokens.ETH.left === "0.002" && t.data.tokens.ETH.budget === "0.005", JSON.stringify(t.data.tokens.ETH));
check("the bar is 24 cells: about 20% sent, 40% waiting, the rest left", ethLine.includes("█████▓▓▓▓▓▓▓▓▓▓░░░░░░░░░"), ethLine);
check("both waiting payments are listed, oldest first, with why", t.data.waiting.map((w) => `${w.id}:${w.why}`).join(",") === "RP-00001:ready,RP-00002:approval line");
check("blocked today counted per rule", t.data.blocked["max per payment"] === 1 && t.data.blocked["payee list"] === 1 && t.lines.some((l) => l.startsWith("Blocked today: 2")));
check("the wallet balance is shown when it was read", t.lines.some((l) => l.includes("Wallet: 1 ETH · 0 USDG")));
check("a tiny amount still shows one cell, a full budget fills the bar", bar(1n, 0n, 1000n).startsWith("█░") && bar(1000n, 0n, 1000n) === "█".repeat(24) && bar(0n, 0n, 0n) === "░".repeat(24));
check("frozen shows on the first line", today({ cfg, receipts: [], frozen: { reason: "agent kept asking" }, now: NOW }).lines[0].includes("FROZEN: agent kept asking"));
const sch = today({ cfg, receipts: [], schedules: [{ id: "S1", payee: "GPU credits", amount: "5", token: "USDG", start: "2026-11-21T09:00" }, { id: "S2", payee: "Weather API", amount: "1", token: "USDG", start: "2026-11-20T18:00", paused: true }], now: NOW });
check("next bills list only schedules that are not paused", sch.data.bills.length === 1 && sch.data.bills[0].id === "S1" && sch.lines.some((l) => l.includes("5 USDG to GPU credits on 2026-11-21 09:00")));
check("nothing waiting says so", today({ cfg, receipts: [], now: NOW }).lines.includes("Waiting for you: nothing."));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
