// Share a payee list. `reinpay payee export` writes your payees to a file signed with your wallet key; `reinpay payee
// import <file>` checks the signature, shows who signed it, and adds only payees that pass the same checks as
// `reinpay payee add`. Anything that looks like a payee you already have, or like your wallet, is left out.
import { keccak256, toBytes, recoverMessageAddress, getAddress, isAddress } from "viem";
import { looksLike } from "./lookalike.js";

const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const KEEP = ["name", "address", "tokens", "note", "maxPerPayment", "daily", "expiresAt", "category"]; // a proof is tied to one wallet, so it is never shared

export function payeeListMessage(f) {
  const { signature, ...body } = f;
  return "Reinpay payee list v1\n" + keccak256(toBytes(JSON.stringify(canon(body))));
}

/** The signed file for these payees. Switched-off payees are left out. */
export async function exportPayees(payees, account, now = Date.now()) {
  const list = payees.filter((p) => !p.disabled).map((p) => Object.fromEntries(KEEP.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])));
  const body = { kind: "reinpay-payees", version: 1, by: getAddress(account.address), at: new Date(now).toISOString(), payees: list };
  return { ...body, signature: await account.signMessage({ message: payeeListMessage(body) }) };
}

/** { ok, signer, reason } */
export async function checkPayeeFile(f) {
  if (f?.kind !== "reinpay-payees" || f.version !== 1 || !Array.isArray(f.payees)) return { ok: false, reason: "not a Reinpay payee list (v1)" };
  if (!f.signature) return { ok: false, reason: "not signed" };
  try {
    const signer = getAddress(await recoverMessageAddress({ message: payeeListMessage(f), signature: f.signature }));
    if (signer !== getAddress(f.by)) return { ok: false, signer, reason: `signed by ${signer}, not by ${f.by} as the file says` };
    return { ok: true, signer, reason: `signed by ${signer}` };
  } catch { return { ok: false, reason: "the signature is not valid" }; }
}

/** Pure: what an import would do against the current payees and wallet. { add, skip: [{ name, why }] } */
export function planImport(f, current, wallet) {
  const add = [], skip = [];
  const known = [...current, ...(wallet ? [{ name: "your own wallet", address: wallet }] : [])];
  for (const p of f.payees) {
    const name = String(p?.name || "");
    if (!/^[\w .'-]{2,40}$/.test(name) || !isAddress(String(p?.address || ""))) { skip.push({ name: name || "?", why: "not a valid name and address" }); continue; }
    const a = getAddress(p.address);
    if (current.some((c) => getAddress(c.address) === a)) { skip.push({ name, why: "this address is already on your list" }); continue; }
    if (current.some((c) => c.name.toLowerCase() === name.toLowerCase())) { skip.push({ name, why: "you already have a payee with this name" }); continue; }
    const like = [...known, ...add].find((k) => looksLike(a, k.address));
    if (like) { skip.push({ name, why: `starts and ends like ${like.name}; add it by hand if you are sure` }); continue; }
    if (p.expiresAt && Date.parse(p.expiresAt) <= Date.now()) { skip.push({ name, why: "already expired" }); continue; }
    add.push({ ...Object.fromEntries(KEEP.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])), name, address: a });
  }
  return { add, skip };
}
