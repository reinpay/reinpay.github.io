// The config seal. Every change the owner makes in the terminal is signed with the wallet's own key; before anything is
// signed, Reinpay checks that signature. An edit to config.json made any other way (an agent with file access, a script)
// breaks the seal, and then no payment is signed until the owner checks the rules and seals them again.
import { keccak256, toBytes, recoverMessageAddress, getAddress } from "viem";

const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);

/** The text that is signed: a fixed label plus the hash of everything that decides a payment. */
export function sealMessage(cfg) {
  const body = { rules: cfg.rules || {}, payees: cfg.payees || [], tokens: cfg.tokens || [], notify: cfg.notify || null };
  return "Reinpay config seal v1\n" + keccak256(toBytes(JSON.stringify(canon(body))));
}

export async function sealConfig(cfg, account) {
  const { seal, ...rest } = cfg;
  const sig = await account.signMessage({ message: sealMessage(rest) });
  return { ...rest, seal: { by: account.address, at: new Date().toISOString(), sig } };
}

/** { ok, reason }: ok only if the seal was made by `wallet` over exactly this config. */
export async function checkSeal(cfg, wallet) {
  if (!cfg.seal?.sig) return { ok: false, reason: "your rules are not sealed yet" };
  try {
    const by = await recoverMessageAddress({ message: sealMessage(cfg), signature: cfg.seal.sig });
    if (wallet && getAddress(by) === getAddress(wallet)) return { ok: true, reason: `sealed ${cfg.seal.at}` };
    return { ok: false, reason: "config.json was changed outside reinpay since it was last sealed" };
  } catch { return { ok: false, reason: "the seal in config.json is not valid" }; }
}
