// Scheduled payments. What to pay (payee, amount, token, cadence) is part of the sealed config; when it next runs is kept
// apart in schedules-state.json, so running schedules never breaks the seal. `reinpay schedule run` (put it on cron or Task Scheduler)
// asks for every payment that is due, exactly like the agent would: every rule, the mainnet simulation, a receipt.
// A due payment that the rules hold waits for you; one they block is blocked. Nothing is ever paid twice for one slot.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOME, writePrivate } from "./config.js";

const statePath = () => join(HOME(), "schedules-state.json");
export function loadState() { try { return existsSync(statePath()) ? JSON.parse(readFileSync(statePath(), "utf8")) : {}; } catch { return {}; } }
export const saveState = (st) => writePrivate(statePath(), JSON.stringify(st, null, 1) + "\n");
/** When a schedule runs next: from the state file, or its start. */
export const nextOf = (s, st = loadState()) => st[s.id]?.next || s.start;

export const EVERY = ["daily", "weekly", "monthly"];

/** The next time after `from` for this cadence, keeping the time of day. */
export function nextAfter(iso, every) {
  const d = new Date(iso);
  if (every === "daily") d.setDate(d.getDate() + 1);
  else if (every === "weekly") d.setDate(d.getDate() + 7);
  else if (every === "monthly") { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  else throw new Error(`Unknown cadence "${every}".`);
  return d.toISOString();
}

export function newSchedule({ payee, amount, token, every, start, memo }, now = Date.now()) {
  if (!EVERY.includes(every)) throw new Error("Cadence must be daily, weekly or monthly.");
  if (!/^\d+(\.\d+)?$/.test(String(amount || ""))) throw new Error("Amount must be a plain decimal, e.g. 5 or 2.5.");
  const first = start ? new Date(start) : new Date(now);
  if (Number.isNaN(first.getTime())) throw new Error(`"${start}" is not a date. Use something like 2026-12-01 or 2026-12-01T09:00.`);
  return { id: "SC-" + randomBytes(3).toString("hex").toUpperCase(), payee, amount: String(amount), token, every, start: first.toISOString(), ...(memo ? { memo: String(memo).slice(0, 120) } : {}), createdAt: new Date(now).toISOString() };
}

/** Pure: which schedules are due at `now`. */
export const due = (schedules, st = {}, now = Date.now()) => (schedules || []).filter((s) => !s.paused && Date.parse(nextOf(s, st)) <= now);

/** Advance a schedule past `now` (skipping missed slots: one payment per run, never a backlog). Returns how many were skipped. */
export function advance(s, st, now = Date.now()) {
  let next = nextAfter(nextOf(s, st), s.every), skipped = 0;
  while (Date.parse(next) <= now) { next = nextAfter(next, s.every); skipped++; }
  st[s.id] = { next, lastRun: new Date(now).toISOString() };
  return { next, skipped };
}
