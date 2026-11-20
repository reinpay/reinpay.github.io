// reinpay rules template: three ready rule sets, printed as the exact commands to run. Nothing is changed by printing:
// rules still change only when the owner runs the commands in their own terminal.
export const TEMPLATES = {
  cautious: { about: "small budgets, you approve most payments, every new payee waits for you",
    rules: { daily: { USDG: 10, ETH: 0.002 }, maxPerPayment: { USDG: 5, ETH: 0.001 }, approveAbove: { USDG: 1, ETH: 0.0005 }, repeatGuardMinutes: 30, maxPerHour: 5, memoMin: 10, firstPayment: "ask", expireAfterMinutes: 1440 } },
  balanced: { about: "the defaults plus a memo rule and an hourly cap",
    rules: { daily: { USDG: 25, ETH: 0.005 }, maxPerPayment: { USDG: 10, ETH: 0.002 }, approveAbove: { USDG: 5, ETH: 0.001 }, repeatGuardMinutes: 10, maxPerHour: 20, memoMin: 5 } },
  open: { about: "room for a busy agent, still with a max per payment and an approval line",
    rules: { daily: { USDG: 100, ETH: 0.02 }, maxPerPayment: { USDG: 50, ETH: 0.01 }, approveAbove: { USDG: 25, ETH: 0.005 }, repeatGuardMinutes: 5, maxPerHour: 60 } },
};

/** The commands that set a template's rules, in a fixed order. */
export function commandsFor(name) {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`No template "${name}". Pick one of: ${Object.keys(TEMPLATES).join(", ")}.`);
  const r = t.rules, C = [];
  for (const [k, cmd] of [["daily", "daily"], ["maxPerPayment", "max"], ["approveAbove", "approve-above"]]) for (const [tok, v] of Object.entries(r[k])) C.push(`reinpay rule ${cmd} ${tok} ${v}`);
  C.push(`reinpay rule repeat-guard ${r.repeatGuardMinutes}`, `reinpay rule per-hour ${r.maxPerHour}`, `reinpay rule memo ${r.memoMin ?? "off"}`, `reinpay rule first-payment ${r.firstPayment || "off"}`, `reinpay rule expire-after ${r.expireAfterMinutes ? `${r.expireAfterMinutes / 60}h` : "off"}`);
  return C;
}

/** What would change from the rules you have now: [{ what, now, then }]. */
export function compare(rules, name) {
  const t = TEMPLATES[name].rules, out = [], v = (x) => (x === undefined || x === null ? "off" : String(x));
  for (const k of ["daily", "maxPerPayment", "approveAbove"]) for (const tok of Object.keys(t[k])) if (v(rules?.[k]?.[tok]) !== v(t[k][tok])) out.push({ what: `${k} ${tok}`, now: v(rules?.[k]?.[tok]), then: v(t[k][tok]) });
  for (const [k, label] of [["repeatGuardMinutes", "repeat guard (min)"], ["maxPerHour", "per hour"], ["memoMin", "memo (chars)"], ["firstPayment", "first payment"], ["expireAfterMinutes", "expire after (min)"]]) if (v(rules?.[k]) !== v(t[k])) out.push({ what: label, now: v(rules?.[k]), then: v(t[k]) });
  return out;
}
