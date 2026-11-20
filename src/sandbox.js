// reinpay sandbox: try Reinpay with no money. A throwaway wallet in a temporary folder gets a pretend 1 ETH that exists
// only inside the mainnet simulation and the balance read. The rules and the eth_simulateV1 calls are the real ones.
// Nothing is signed or sent, and the folder is deleted at the end.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAddress, parseEther } from "viem";

const BURN = "0x000000000000000000000000000000000000dEaD", OTHER = "0x00000000000000000000000000000000DeaDBeef";

/** Runs the tour; `log` gets each line. Returns the receipts made. */
export async function runSandbox({ log = console.log, keep = false } = {}) {
  const saved = { home: process.env.REINPAY_HOME, profile: process.env.REINPAY_PROFILE };
  const dir = mkdtempSync(join(tmpdir(), "reinpay-sandbox-"));
  process.env.REINPAY_HOME = dir; delete process.env.REINPAY_PROFILE;
  const K = await import("./keystore.js"), C = await import("./config.js"), P = await import("./pay.js"), S = await import("./simulate.js"), CH = await import("./chain.js"), { sealConfig } = await import("./seal.js");
  const c = CH.publicClient(), realBalance = c.getBalance, prevOverrides = S._getTestOverrides();
  try {
    const pk = generatePrivateKey(), acct = privateKeyToAccount(pk);
    K.writeKeystore(pk, "sandbox-" + Math.random().toString(36).slice(2, 12));
    const me = getAddress(acct.address);
    c.getBalance = async (a) => (getAddress(a.address) === me ? parseEther("1") : realBalance.call(c, a));
    S._setTestOverrides((from) => (getAddress(from) === me ? { [me]: { balance: "0xde0b6b3a7640000" } } : prevOverrides ? prevOverrides(from) : undefined));
    const cfg = { ...C.DEFAULT_CONFIG, rules: { ...C.DEFAULT_CONFIG.rules }, payees: [{ name: "Weather API", address: getAddress(BURN), isContract: false, addedAt: new Date().toISOString() }, { name: "GPU credits", address: getAddress(OTHER), isContract: false, addedAt: new Date().toISOString() }] };
    C.saveConfig(await sealConfig(cfg, acct));
    log(`Sandbox wallet ${me} (throwaway, pretend 1 ETH that exists only inside the simulation).`);
    log(`Rules: ${cfg.rules.daily.ETH} ETH a day, ${cfg.rules.maxPerPayment.ETH} max per payment, asks you above ${cfg.rules.approveAbove.ETH}. Payees: Weather API, GPU credits.`);
    log("");
    const steps = [
      ["Weather API", "0.0005", "a forecast bundle, inside every rule"],
      ["Weather API", "0.0005", "the same payment again right away"],
      ["GPU credits", "0.0015", "above the approval line"],
      ["GPU credits", "0.003", "above the max per payment"],
      ["cheap-gpu.example", "0.0001", "a payee that is not on the list"],
    ];
    const out = [];
    for (const [payee, amount, why] of steps) {
      const r = await P.requestPayment({ payee, amount, token: "ETH", memo: why }, { by: "sandbox" });
      out.push(r);
      log(`agent asks: ${amount} ETH to ${payee} (${why})`);
      log(`  → ${r.status.toUpperCase()}  ${r.rule}: ${r.reason}${r.simulation?.block ? `\n    simulated on Robinhood Chain mainnet at block ${r.simulation.block}` : ""}`);
    }
    log("");
    log("Nothing was signed or sent. With the real thing, waiting payments are yours to approve with reinpay approve.");
    log("Next: reinpay init, then reinpay payee add and reinpay rule. See reinpay --help.");
    return out;
  } finally {
    c.getBalance = realBalance; S._setTestOverrides(prevOverrides); // put back exactly what was there
    if (saved.home === undefined) delete process.env.REINPAY_HOME; else process.env.REINPAY_HOME = saved.home;
    if (saved.profile !== undefined) process.env.REINPAY_PROFILE = saved.profile;
    if (!keep) rmSync(dir, { recursive: true, force: true });
  }
}
