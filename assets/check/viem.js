// Browser stand-in for the four viem helpers the rules engine uses. Addresses are compared lowercase here
// (the page never needs checksums); amounts are exact bigints, as in viem.
export const isAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a));
export const getAddress = (a) => { if (!isAddress(a)) throw new Error(`"${a}" is not a valid 0x address.`); return "0x" + String(a).slice(2).toLowerCase(); };
export function parseUnits(value, decimals) {
  const [i, f = ""] = String(value).split(".");
  return BigInt(i || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}
export function formatUnits(v, decimals) {
  v = BigInt(v); const neg = v < 0n; if (neg) v = -v;
  const s = v.toString().padStart(decimals + 1, "0"), i = s.slice(0, s.length - decimals), f = s.slice(s.length - decimals).replace(/0+$/, "");
  return (neg ? "-" : "") + i + (f ? "." + f : "");
}
export const recoverMessageAddress = async () => { throw new Error("not available in the browser check"); };
