// Payee proof: a payee shows they control their address by signing a short message with it. Reinpay never asks for
// their key; they sign in their own wallet (any wallet can sign a message) and send you the signature.
import { recoverMessageAddress, getAddress } from "viem";

/** The exact text a payee signs. It names the payee and your wallet, so a proof cannot be reused elsewhere. */
export const proofMessage = (payee, wallet) => `Reinpay payee proof v1\nI control ${getAddress(payee.address)}\nand agree to be paid as "${payee.name}"\nby the Reinpay wallet ${getAddress(wallet)}`;

/** { ok, reason } for a signature from a payee. */
export async function checkProof(payee, wallet, signature) {
  if (!/^0x[0-9a-fA-F]{130}$/.test(String(signature || ""))) return { ok: false, reason: "that is not a 65-byte signature (0x followed by 130 hex characters)" };
  try {
    const by = await recoverMessageAddress({ message: proofMessage(payee, wallet), signature });
    return getAddress(by) === getAddress(payee.address) ? { ok: true, reason: `signed by ${by}` } : { ok: false, reason: `signed by ${by}, not by the payee's address ${getAddress(payee.address)}` };
  } catch { return { ok: false, reason: "the signature is not valid" }; }
}
