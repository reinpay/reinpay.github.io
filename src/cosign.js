// Two-person approval. Above a line you set, a payment needs a second signature from another address (a co-founder,
// a finance wallet) before `reinpay approve` will sign it. The co-signer signs a message naming this exact payment.
import { recoverMessageAddress, getAddress, parseUnits } from "viem";
import { TOKENS } from "./chain.js";

export const cosignMessage = (r) => `Reinpay co-sign v1\nwallet ${getAddress(r.wallet)}\nreceipt ${r.id}\npay ${r.amountRaw} base units of ${r.token} to ${getAddress(r.payeeAddress)}`;

/** Does this payment need a co-signer under these rules? */
export function needsCosign(rules, symbol, amountRaw) {
  const c = rules?.cosign; const line = c?.above?.[symbol];
  if (!c?.by || line == null) return false;
  return BigInt(amountRaw) > parseUnits(String(line), TOKENS[symbol].decimals);
}

/** { ok, reason } for a co-signature on a receipt. */
export async function checkCosign(rules, r, signature) {
  if (!/^0x[0-9a-fA-F]{130}$/.test(String(signature || ""))) return { ok: false, reason: `this payment needs a co-signature from ${rules.cosign.by}: run reinpay cosign-message ${r.id}, have them sign it, then reinpay approve ${r.id} --cosig=0x…` };
  try {
    const by = await recoverMessageAddress({ message: cosignMessage(r), signature });
    return getAddress(by) === getAddress(rules.cosign.by) ? { ok: true, reason: `co-signed by ${by}` } : { ok: false, reason: `the co-signature is from ${by}, not ${getAddress(rules.cosign.by)}` };
  } catch { return { ok: false, reason: "the co-signature is not valid" }; }
}
