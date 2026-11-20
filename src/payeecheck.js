// reinpay payee check: look at an address on Robinhood Chain before it becomes a payee. The chain is read in pay.js;
// this file only turns those facts into a verdict, so it can be tested offline.

/**
 * facts: { address, own, onList (name|null), lookalike ({name,address}|null), code (bool), token (symbol|null),
 *          sourcify ("exact_match"|"match"|null|undefined), nonce (number), balances ({ETH,USDG} strings) }
 * Returns { verdict: "ok"|"careful"|"stop", kind, lines: [...], next: string|null }.
 */
export function payeeVerdict(f) {
  const L = [], kind = f.own ? "your own wallet" : f.token ? `token contract (${f.token})` : f.code ? "contract" : "wallet";
  L.push(`Kind:      ${kind}`);
  if (!f.code) L.push(`History:   ${f.nonce === 0 ? "has never sent a transaction" : `has sent ${f.nonce} transaction${f.nonce === 1 ? "" : "s"}`}`);
  if (f.code && !f.token) L.push(`Source:    ${f.sourcify ? `verified on Sourcify (${f.sourcify.replace("_", " ")})` : f.sourcify === null ? "not verified on Sourcify" : "Sourcify could not be reached"}`);
  if (f.balances) L.push(`Balance:   ${Object.entries(f.balances).map(([t, v]) => `${v} ${t}`).join(" · ")}`);
  L.push(`Your list: ${f.onList ? `already a payee, as "${f.onList}"` : "not a payee yet"}`);
  if (f.lookalike) L.push(`Lookalike: starts and ends like "${f.lookalike.name}" (${f.lookalike.address}) but is a different address`);
  let verdict = "ok", why;
  if (f.own) { verdict = "stop"; why = "This is your own Reinpay wallet. Paying it moves nothing anywhere."; }
  else if (f.token) { verdict = "stop"; why = `This is the ${f.token} token contract. Tokens sent to a token contract are usually stuck for good; reinpay payee add refuses it.`; }
  else if (f.lookalike) { verdict = "stop"; why = `It imitates ${f.lookalike.name}. This is how address poisoning works: compare every character with the payee before you add it.`; }
  else if (f.code && !f.sourcify) { verdict = "careful"; why = "A contract whose code nobody can read on Sourcify. Ask the payee what it is, and whether it accepts plain transfers."; }
  else if (f.code) { verdict = "careful"; why = "A verified contract. Make sure it is meant to receive plain transfers of the token you will pay."; }
  else if (f.nonce === 0) { verdict = "careful"; why = "A fresh address with no history. That can be fine, but confirm it with the payee another way before you add it."; }
  else why = "A wallet with a history on Robinhood Chain. Still confirm the address with the payee.";
  if (f.onList && verdict === "ok") why = `Already on your list as "${f.onList}".`;
  L.push("");
  L.push(`${verdict === "ok" ? "Looks fine" : verdict === "careful" ? "Be careful" : "Do not add"}: ${why}`);
  const next = verdict === "stop" || f.onList ? null : `reinpay payee add "<name>" ${f.address}`;
  if (next) L.push(`To add it: ${next}`);
  return { verdict, kind, lines: L, next };
}

/**
 * What reinpay payee add does after the check: "go" adds it, "ask" wants the owner to type yes (or --yes),
 * "stop" refuses, "lookalike" leaves it to the lookalike guard, which asks for the address in full.
 */
export function addStep(v, { yes = false } = {}) {
  if (v.lookalike && !v.own && !v.token) return "lookalike";
  if (v.verdict === "stop") return "stop";
  if (v.verdict === "careful") return yes ? "go" : "ask";
  return "go";
}
