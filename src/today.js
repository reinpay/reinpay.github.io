// reinpay today: one screen for the owner. Today's budget per token as a bar (sent, waiting, left), what waits for you,
// what was blocked and by which rule, the next bills, grants and the brakes. Pure: the caller passes the balances in.
import { dailyLimit, totals, fmt, localDay, activeGrants } from "./rules.js";
import { TOKENS } from "./chain.js";
import { breakerOf } from "./freeze.js";

const W = 24; // bar width in characters
/** A bar of W cells: █ sent, ▓ waiting, ░ left. Rounds so that anything above zero shows at least one cell. */
export function bar(spent, held, cap) {
  if (!cap || cap <= 0n) return "░".repeat(W);
  const cells = (v) => (v <= 0n ? 0 : Math.max(1, Math.round(Number((v * BigInt(W) * 1000n) / cap) / 1000)));
  let s = Math.min(W, cells(spent)), h = Math.min(W - s, cells(held));
  return "█".repeat(s) + "▓".repeat(h) + "░".repeat(W - s - h);
}

const ago = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/** Returns { lines, data }. */
export function today({ cfg, receipts, balances = null, frozen = null, schedules = [], nextOf = (s) => s.start, now = Date.now() }) {
  const rules = cfg.rules || {}, day = localDay(now), L = [], data = { date: day, tokens: {}, waiting: [], blocked: {}, bills: [] };
  L.push(`Reinpay today · ${day}${frozen ? `   FROZEN: ${frozen.reason}` : ""}`);
  L.push("");
  const syms = Object.keys(TOKENS).filter((t) => dailyLimit(rules, t, now) || receipts.some((r) => r.token === t && localDay(r.createdAt) === day));
  const w = Math.max(4, ...syms.map((t) => t.length));
  for (const t of syms) {
    const cap = dailyLimit(rules, t, now) || 0n, { spent, held } = totals(receipts, t, now);
    const left = cap > spent + held ? cap - spent - held : 0n, num = (v) => fmt(v, t).split(" ")[0];
    const g = activeGrants(rules, t, now).length;
    L.push(`  ${t.padEnd(w)}  ${bar(spent, held, cap)}  ${num(spent)} sent · ${num(held)} waiting · ${num(left)} left of ${num(cap)}${g ? ` (incl. ${g} grant${g > 1 ? "s" : ""})` : ""}`);
    data.tokens[t] = { sent: num(spent), waiting: num(held), left: num(left), budget: num(cap), ...(balances?.[t] != null ? { balance: num(balances[t]) } : {}) };
  }
  L.push(`  ${"".padEnd(w)}  █ sent  ▓ waiting  ░ left`);
  if (balances) L.push(`  Wallet: ${syms.map((t) => `${fmt(balances[t] ?? 0n, t)}`).join(" · ")} (read from Robinhood Chain now)`);
  L.push("");
  const waiting = receipts.filter((r) => ["needs_approval", "ready"].includes(r.status)).sort((a, b) => a.createdAt - b.createdAt);
  L.push(waiting.length ? `Waiting for you (${waiting.length}):` : "Waiting for you: nothing.");
  for (const r of waiting) {
    L.push(`  ${r.id}  ${`${r.amount} ${r.token}`.padEnd(14)} ${String(r.payee).padEnd(14)} ${r.status === "ready" ? "ready" : r.rule}, ${ago(now - r.createdAt)}`);
    data.waiting.push({ id: r.id, amount: r.amount, token: r.token, payee: r.payee, why: r.status === "ready" ? "ready" : r.rule });
  }
  if (waiting.length) L.push(`  Approve with reinpay approve <id> (or --all), refuse with reinpay reject <id>.`);
  L.push("");
  const blocked = receipts.filter((r) => r.status === "blocked" && localDay(r.createdAt) === day);
  for (const r of blocked) data.blocked[r.rule] = (data.blocked[r.rule] || 0) + 1;
  const top = Object.entries(data.blocked).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`);
  L.push(blocked.length ? `Blocked today: ${blocked.length} (${top.join(", ")})` : "Blocked today: none.");
  const sent = receipts.filter((r) => r.status === "sent" && localDay(r.createdAt) === day).length;
  L.push(`Sent today: ${sent}`);
  const bills = (schedules || []).filter((s) => !s.paused).map((s) => ({ ...s, next: nextOf(s) })).sort((a, b) => Date.parse(a.next) - Date.parse(b.next)).slice(0, 3);
  for (const s of bills) data.bills.push({ id: s.id, payee: s.payee, amount: s.amount, token: s.token, next: s.next });
  if (bills.length) L.push(`Next bills: ${bills.map((s) => `${s.amount} ${s.token} to ${s.payee} on ${s.next.slice(0, 16).replace("T", " ")}`).join("; ")}`);
  const b = breakerOf(rules);
  L.push(`Brakes: ${frozen ? "frozen" : "not frozen"} · circuit breaker ${b ? `${b.count} blocks in ${b.minutes} min` : "off"} · autosend ${rules.autoSend ? "on" : "off"}`);
  return { lines: L, data };
}
