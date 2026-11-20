// reinpay review: suggestions for your rules, from your own receipts. Read-only and local: it never changes anything,
// it only says what it noticed and the command you could run. Pure: config and receipts in, suggestions out.
import { localDay, dailyLimit, fmt, DONE_SPENT, OPEN } from "./rules.js";
import { TOKENS } from "./chain.js";

const DAY = 86_400_000;

export function review(cfg, receipts, { now = Date.now(), days = 30 } = {}) {
  const out = [];
  const add = (level, title, detail, fix) => out.push({ level, title, detail, fix });
  const since = now - days * DAY, week = now - 7 * DAY;
  const recent = receipts.filter((r) => r.createdAt >= since), lastWeek = receipts.filter((r) => r.createdAt >= week);

  // payees never paid
  for (const p of cfg.payees || []) {
    if (p.disabled) continue;
    const added = Date.parse(p.addedAt || 0) || 0;
    const paid = recent.some((r) => r.payeeAddress === p.address && DONE_SPENT.includes(r.status));
    if (!paid && added && added < since) add("tidy", `${p.name} was not paid in ${days} days`, `Added ${new Date(added).toISOString().slice(0, 10)}. A payee you no longer use is one more address your agent may pay.`, `reinpay payee off "${p.name}"`);
  }
  // budgets: hit often, or far too big
  for (const t of Object.keys(TOKENS)) {
    const daily = dailyLimit(cfg.rules, t, now);
    const hits = lastWeek.filter((r) => r.token === t && r.status === "blocked" && r.rule === "daily budget").length;
    if (hits >= 3) add("look", `The ${t} daily budget blocked ${hits} requests this week`, "Either the agent needs more, or it is asking for more than it should. Check the memos first.", `reinpay receipts --status=blocked`);
    if (!daily) continue;
    const perDay = {};
    for (const r of lastWeek) if (r.token === t && (DONE_SPENT.includes(r.status) || OPEN.includes(r.status))) perDay[localDay(r.createdAt)] = (perDay[localDay(r.createdAt)] || 0n) + BigInt(r.amountRaw);
    const peak = Object.values(perDay).reduce((a, v) => (v > a ? v : a), 0n);
    if (Object.keys(perDay).length >= 3 && peak * 5n < daily) add("tighten", `The ${t} daily budget is much bigger than what is used`, `Busiest day this week: ${fmt(peak, t)} of ${fmt(daily, t)}. A smaller budget limits what a confused agent can spend.`, `reinpay rule daily ${t} ${Number(fmt(peak * 2n, t).split(" ")[0]) || 1}`);
  }
  // agent behaviour
  const offList = lastWeek.filter((r) => r.status === "blocked" && r.rule === "payee list").length;
  if (offList >= 3) add("look", `${offList} requests this week were to payees not on your list`, "An agent that keeps asking for strangers may be following instructions from a page or a message.", "reinpay receipts --status=blocked");
  const stale = receipts.filter((r) => ["needs_approval", "ready"].includes(r.status) && now - r.createdAt > DAY).length;
  if (stale && !cfg.rules.expireAfterMinutes) add("tidy", `${stale} payment${stale === 1 ? "" : "s"} waited more than a day`, "Waiting payments hold today's budget until you answer.", "reinpay rule expire-after 24h");
  // safety switches
  if (!cfg.notify) add("safety", "No notifications", "You only learn that a payment waits for you when you look.", "reinpay notify telegram <bot-token> <chat-id>");
  if (cfg.rules.autoSend && cfg.rules.breaker === "off") add("safety", "Autosend is on and the circuit breaker is off", "Nothing stops a looping agent but your budgets.", "reinpay rule breaker 5 10");
  if (cfg.rules.autoSend && !cfg.rules.maxPerHour) add("safety", "Autosend is on with no per-hour cap", "An agent could send many small payments quickly.", "reinpay rule per-hour 10");
  const firstTimers = new Set(recent.filter((r) => DONE_SPENT.includes(r.status)).map((r) => r.payeeAddress)).size;
  if (cfg.rules.autoSend && cfg.rules.firstPayment !== "ask" && firstTimers > 0) add("safety", "First payments to new payees are sent without asking", "With autosend on, a new payee's first payment never waits for you.", "reinpay rule first-payment ask");
  return out;
}

export function reviewText(list) {
  if (!list.length) return "Nothing to suggest. Your rules fit how your agent spends.";
  const order = { safety: 0, look: 1, tighten: 2, tidy: 3 };
  return list.sort((a, b) => order[a.level] - order[b.level]).map((s) => `[${s.level}] ${s.title}\n    ${s.detail}\n    → ${s.fix}`).join("\n\n") + `\n\n${list.length} suggestion${list.length === 1 ? "" : "s"}. Nothing was changed.`;
}
