// Address poisoning guard. Scammers send dust from an address that starts and ends like one you already use, hoping
// you copy it from your history. Reinpay refuses a new payee that shares the first and last characters with a payee
// you already have (or with your own wallet) but is a different address, until you confirm it in your terminal.
import { getAddress } from "viem";

export const EDGE = 4; // hex characters compared at each end, after 0x

const ends = (a) => { const h = getAddress(a).slice(2).toLowerCase(); return [h.slice(0, EDGE), h.slice(-EDGE)]; };

/** Does `a` look like `b` (same first and last EDGE hex characters) without being the same address? */
export function looksLike(a, b) {
  if (getAddress(a) === getAddress(b)) return false;
  const [a1, a2] = ends(a), [b1, b2] = ends(b);
  return a1 === b1 && a2 === b2;
}

/** The first known address that `address` imitates, as { name, address }, or null. `known` is [{ name, address }]. */
export function findLookalike(address, known) {
  for (const k of known) if (k?.address && looksLike(address, k.address)) return { name: k.name, address: getAddress(k.address) };
  return null;
}

/** Every pair inside a list that look alike (for reinpay doctor). */
export function lookalikePairs(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (looksLike(list[i].address, list[j].address)) out.push([list[i].name, list[j].name]);
  return out;
}

export class LookalikeError extends Error {
  constructor(address, like) {
    super(`${getAddress(address)} starts and ends like ${like.name} (${like.address}) but is a different address. This is how address poisoning scams work. Check it with the payee directly.`);
    this.code = "LOOKALIKE";
    this.like = like;
  }
}
