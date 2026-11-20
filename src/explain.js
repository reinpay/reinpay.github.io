// reinpay check --explain: every rule, in the order decide() runs them, with what it found.
// Pure like rules.js. decide() stays the only judge: the step that matches its rule is marked as the one that decided,
// and the steps after it are marked "not reached", because decide() stops at the first rule that blocks or holds.
import { parseUnits, formatUnits } from "viem";
import { TOKENS } from "./chain.js";
import { decide, limit, dailyLimit, totals, fmt, localDay, insideHours, DONE_SPENT, OPEN } from "./rules.js";
import { needsCosign } from "./cosign.js";

const step = (rule, state, detail) => ({ rule, state, detail }); // state: pass | block | hold | off

/** Returns { steps, decision }. steps[i].decided is true on the deciding step; later steps have reached: false. */
export function explain({ rules, receipts, request, now = Date.now(), excludeId = null }) {
  const decision = decide({ rules, receipts, request, now, excludeId });
  const { payee, token: symbol, amountRaw } = request;
  const list = excludeId ? receipts.filter((r) => r.id !== excludeId) : receipts;
  const S = [];
  if (!TOKENS[symbol]) S.push(step("tokens", "block", `${symbol} is not a token Reinpay spends`));
  else S.push(step("tokens", "pass", `${symbol} is a token Reinpay spends`));
  if (!payee) S.push(step("payee list", "block", "not on your payee list"));
  else if (payee.disabled) S.push(step("payee list", "block", `${payee.name} is switched off`));
  else S.push(step("payee list", "pass", `${payee.name} is on your list`));
  if (payee && !payee.disabled) {
    if (payee.expiresAt) S.push(step("payee expired", Date.parse(payee.expiresAt) <= now ? "block" : "pass", `expires ${payee.expiresAt}`));
    else S.push(step("payee expired", "off", "no end date"));
    if (payee.tokens) S.push(step("payee tokens", payee.tokens.includes(symbol) ? "pass" : "block", `may be paid in ${payee.tokens.join(" or ")}`));
    else S.push(step("payee tokens", "off", "any token"));
  }
  const tok = TOKENS[symbol];
  if (tok && payee && !payee.disabled) {
    S.push(step("amount", amountRaw > 0n ? "pass" : "block", amountRaw > 0n ? fmt(amountRaw, symbol) : "must be above zero"));
    const memoMin = Number(rules.memoMin || 0);
    if (memoMin > 0) { const n = String(request.memo ?? "").trim().length; S.push(step("memo", n < memoMin ? "block" : "pass", `${n} of ${memoMin} characters`)); }
    else S.push(step("memo", "off", "no memo rule"));
    const daily = dailyLimit(rules, symbol, now);
    if (daily === null || daily === 0n) S.push(step("daily budget", "block", `no daily budget for ${symbol}`));
    const cap = limit(rules, "maxPerPayment", symbol);
    S.push(cap === null ? step("max per payment", "off", "no max") : step("max per payment", amountRaw > cap ? "block" : "pass", `max ${fmt(cap, symbol)}`));
    const pcap = payee.maxPerPayment?.[symbol] != null ? parseUnits(String(payee.maxPerPayment[symbol]), tok.decimals) : null;
    S.push(pcap === null ? step("payee max", "off", `no max for ${payee.name}`) : step("payee max", amountRaw > pcap ? "block" : "pass", `${payee.name} max ${fmt(pcap, symbol)}`));
    if (daily) {
      const { spent, held } = totals(list, symbol, now);
      const left = daily > spent + held ? daily - spent - held : 0n;
      S.push(step("daily budget", spent + held + amountRaw > daily ? "block" : "pass", `${fmt(left, symbol)} left of ${fmt(daily, symbol)} today`));
    }
    for (const [rk, period, label] of [["weekly", "week", "weekly budget"], ["monthly", "month", "monthly budget"]]) {
      const c = limit(rules, rk, symbol);
      if (c === null) { S.push(step(label, "off", `no ${rk} budget`)); continue; }
      const t = totals(list, symbol, now, null, period); const left = c > t.spent + t.held ? c - t.spent - t.held : 0n;
      S.push(step(label, t.spent + t.held + amountRaw > c ? "block" : "pass", `${fmt(left, symbol)} left of ${fmt(c, symbol)} this ${period}`));
    }
    const pdaily = payee.daily?.[symbol] != null ? parseUnits(String(payee.daily[symbol]), tok.decimals) : null;
    if (pdaily === null) S.push(step("payee daily budget", "off", `no daily budget for ${payee.name}`));
    else { const t = totals(list, symbol, now, payee.address); const left = pdaily > t.spent + t.held ? pdaily - t.spent - t.held : 0n;
      S.push(step("payee daily budget", t.spent + t.held + amountRaw > pdaily ? "block" : "pass", `${fmt(left, symbol)} left of ${payee.name}'s ${fmt(pdaily, symbol)}`)); }
    const perHour = Number(rules.maxPerHour || 0);
    if (perHour > 0) { const n = list.filter((r) => r.createdAt >= now - 3_600_000 && (DONE_SPENT.includes(r.status) || OPEN.includes(r.status))).length;
      S.push(step("payments per hour", n >= perHour ? "block" : "pass", `${n} of ${perHour} in the last hour`)); }
    else S.push(step("payments per hour", "off", "no hourly cap"));
    const cat = payee.category, env = cat ? rules.categories?.[cat]?.daily?.[symbol] : undefined;
    if (env != null && env !== "") {
      const c = parseUnits(String(env), tok.decimals), day = localDay(now); let used = 0n;
      for (const r of list) if (r.category === cat && r.token === symbol && localDay(r.createdAt) === day && (DONE_SPENT.includes(r.status) || OPEN.includes(r.status))) used += BigInt(r.amountRaw);
      S.push(step("category budget", used + amountRaw > c ? "block" : "pass", `${fmt(c > used ? c - used : 0n, symbol)} left of the ${cat} budget`));
    } else S.push(step("category budget", "off", cat ? `no budget for ${cat}` : "no category"));
    if (rules.usd && (rules.usd.max != null || rules.usd.daily != null)) {
      if (request.usdRaw == null) S.push(step("usd price", "block", `no price for ${symbol}`));
      else {
        const u = BigInt(request.usdRaw), usd = (v) => `${formatUnits(v, 6)} USD`;
        if (rules.usd.max != null) S.push(step("usd max", u > parseUnits(String(rules.usd.max), 6) ? "block" : "pass", `about ${usd(u)}, max ${rules.usd.max} USD`));
        if (rules.usd.daily != null) { const day = localDay(now); let used = 0n;
          for (const r of list) if (r.usdRaw != null && localDay(r.createdAt) === day && (DONE_SPENT.includes(r.status) || OPEN.includes(r.status))) used += BigInt(r.usdRaw);
          S.push(step("usd daily budget", used + u > parseUnits(String(rules.usd.daily), 6) ? "block" : "pass", `${usd(used)} used of ${rules.usd.daily} USD today`)); }
      }
    } else S.push(step("usd limits", "off", "no dollar limits"));
    if (request.session) {
      const caps = request.session.caps || {}, c = caps[symbol];
      if (!(symbol in caps)) S.push(step("session budget", "block", `no budget for ${symbol} in this session`));
      else if (c == null) S.push(step("session budget", "off", `no cap for ${symbol} in this session`));
      else { const cp = parseUnits(String(c), tok.decimals); let used = 0n;
        for (const r of list) if (r.session === request.session.id && r.token === symbol && (DONE_SPENT.includes(r.status) || OPEN.includes(r.status))) used += BigInt(r.amountRaw);
        S.push(step("session budget", used + amountRaw > cp ? "block" : "pass", `${fmt(used, symbol)} used of ${fmt(cp, symbol)} this session`)); }
    } else S.push(step("session budget", "off", "not in an agent session"));
    const guard = Number(rules.repeatGuardMinutes || 0);
    if (guard > 0) { const dup = list.find((r) => r.payeeAddress === payee.address && r.token === symbol && BigInt(r.amountRaw) === amountRaw && r.createdAt >= now - guard * 60_000 && (DONE_SPENT.includes(r.status) || OPEN.includes(r.status)));
      S.push(step("repeat guard", dup ? "hold" : "pass", dup ? `same as ${dup.id} within ${guard} minutes` : `no repeat in ${guard} minutes`)); }
    else S.push(step("repeat guard", "off", "off"));
    if (rules.firstPayment === "ask") { const first = !list.some((r) => r.payeeAddress === payee.address && DONE_SPENT.includes(r.status));
      S.push(step("first payment", first ? "hold" : "pass", first ? `first payment to ${payee.name}` : `${payee.name} was paid before`)); }
    else S.push(step("first payment", "off", "off"));
    if (rules.hours) S.push(step("quiet hours", insideHours(rules.hours, now) ? "pass" : "hold", `payment hours ${rules.hours.from}:00 to ${rules.hours.to}:00${rules.hours.weekdays ? ", weekdays" : ""}`));
    else S.push(step("quiet hours", "off", "any time"));
    if (rules.requireProven && payee.isContract !== true) S.push(step("unproven payee", payee.proof ? "pass" : "hold", payee.proof ? "payee proved its address" : "payee has not proved its address"));
    else S.push(step("unproven payee", "off", "not required"));
    if (rules.cosign?.above?.[symbol] != null) S.push(step("co-sign", needsCosign(rules, symbol, amountRaw) ? "hold" : "pass", `second signature above ${rules.cosign.above[symbol]} ${symbol}`));
    else S.push(step("co-sign", "off", "off"));
    const line = limit(rules, "approveAbove", symbol);
    S.push(line === null ? step("approval line", "off", "no approval line") : step("approval line", amountRaw > line ? "hold" : "pass", `asks you above ${fmt(line, symbol)}`));
  }
  // Mark the step decide() stopped at. "within rules" means every step passed.
  let at = decision.status === "allowed" ? -1 : S.findIndex((s) => s.rule === decision.rule && s.state !== "pass" && s.state !== "off");
  if (decision.status !== "allowed" && at === -1) { S.push(step(decision.rule, decision.status === "blocked" ? "block" : "hold", decision.reason)); at = S.length - 1; }
  const steps = S.map((s, i) => ({ ...s, decided: i === at, reached: at === -1 || i <= at }));
  return { steps, decision };
}

const MARK = { pass: "✓", block: "✗", hold: "⏸", off: "·" };
/** Plain text lines for the terminal. */
export function explainLines(steps) {
  const w = Math.max(...steps.map((s) => s.rule.length));
  return steps.map((s) => `  ${s.reached ? MARK[s.state] : " "} ${s.rule.padEnd(w)}  ${s.reached ? s.detail : "not reached"}${s.decided ? "   ← decided" : ""}`);
}
