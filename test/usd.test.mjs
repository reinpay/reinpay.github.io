// v0.15: USD rules and the two-pool ETH price, offline with a pretend chain.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-usd-"));
const PR = await import("../src/price.js");
const R = await import("../src/rules.js");
await import("../src/chain.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const sqrtFor = (price) => BigInt(Math.round(Math.sqrt(price / 1e12) * 2 ** 96));
const word = (x) => "0x" + x.toString(16).padStart(64, "0");
const addr = (a) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");
const fake = (prices, { wrongToken = false, down = [] } = {}) => ({ request: async ({ params: [{ to, data }] }) => {
  const i = PR.POOLS.findIndex((p) => p.toLowerCase() === to.toLowerCase());
  if (down.includes(i)) throw new Error("fetch failed");
  if (data === "0x0dfe1681") return addr(wrongToken && i === 1 ? "0x0000000000000000000000000000000000000001" : PR.WETH);
  if (data === "0xd21220a7") return addr(PR.USDG);
  return word(sqrtFor(prices[i])) + "0".repeat(64 * 6);
} });

check("sqrtPriceX96 converts to USDG per ETH", Math.abs(PR.fromSqrt(sqrtFor(1806.88)) - 1806.88) < 0.01);
check("two close prices agree, averaged", Math.abs(PR.agree([1800, 1810]).price - 1805) < 1e-9);
check("two prices 3% apart: no price", PR.agree([1800, 1860]).price === null && /disagree/.test(PR.agree([1800, 1860]).reason));
check("one price only: no price", PR.agree([1800, NaN]).price === null);
let p = await PR.ethPrice({ client: fake([1806, 1807]) });
check("ethPrice from two pools", Math.abs(p.price - 1806.5) < 1e-6 && p.pools.length === 2);
check("a pool that is not WETH/USDG is ignored, so there is no price", (await PR.ethPrice({ client: fake([1806, 1807], { wrongToken: true }) })).price === null);
check("a pool that does not answer: no price", (await PR.ethPrice({ client: fake([1806, 1807], { down: [0] }) })).price === null);
check("a manipulated pool (10% off): no price", (await PR.ethPrice({ client: fake([1806, 1990]) })).price === null);
let u = await PR.usdValue("ETH", 10n ** 16n, { client: fake([1800, 1800]) });
check("0.01 ETH at 1800 is 18 USD", u.value === 18_000_000n);
check("USDG counts 1 to 1 with no network", (await PR.usdValue("USDG", 2_500_000n)).value === 2_500_000n);
check("other tokens have no USD price", (await PR.usdValue("TSLA", 1n)).value === null);

const DEAD = "0x000000000000000000000000000000000000dEaD";
const rules = { daily: { USDG: 100, ETH: 1 }, maxPerPayment: { USDG: 100, ETH: 1 }, approveAbove: { USDG: 100, ETH: 1 }, repeatGuardMinutes: 0, usd: { max: "20", daily: "30" } };
const req = (token, amountRaw, usdRaw, usdReason) => ({ payee: { name: "Burn", address: DEAD }, token, amountRaw, usdRaw, usdReason });
check("0.01 ETH worth 18 USD is under a 20 USD max", R.decide({ rules, receipts: [], request: req("ETH", 10n ** 16n, "18000000") }).status === "allowed");
const big = R.decide({ rules, receipts: [], request: req("ETH", 2n * 10n ** 16n, "36000000") });
check("0.02 ETH worth 36 USD is blocked by usd max, with the value", big.rule === "usd max" && /36 USD/.test(big.reason));
const today = [{ token: "USDG", amountRaw: "15000000", usdRaw: "15000000", status: "sent", createdAt: Date.now() }];
check("15 USD of USDG already today + 18 USD of ETH is over the 30 USD daily budget", R.decide({ rules, receipts: today, request: req("ETH", 10n ** 16n, "18000000") }).rule === "usd daily budget");
check("the USD daily budget adds up USDG and ETH together", R.decide({ rules, receipts: today, request: req("USDG", 10_000_000n, "10000000") }).status === "allowed");
check("no price while USD rules are on: blocked, fail closed", R.decide({ rules, receipts: [], request: req("ETH", 1n, undefined, "the two pools disagree") }).rule === "usd price");
check("USD rules off: no price needed", R.decide({ rules: { ...rules, usd: undefined }, receipts: [], request: req("ETH", 10n ** 16n) }).status === "allowed");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
