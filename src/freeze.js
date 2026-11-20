// The brakes. `reinpay freeze` stops every payment at once: requests are blocked, autosend stops, approvals are refused.
// The circuit breaker freezes the wallet by itself when the agent keeps getting blocked in a short time, which usually
// means it is looping or following instructions it should not. Anyone may freeze (an agent too); only the owner's
// terminal can unfreeze. The state lives in its own file, frozen.json, so freezing never touches the sealed config.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { HOME, writePrivate } from "./config.js";

export const freezePath = () => join(HOME(), "frozen.json");
export const DEFAULT_BREAKER = { count: 5, minutes: 10 };

/** null when payments may run; otherwise { at, by, reason }. An unreadable file counts as frozen. */
export function frozen() {
  const p = freezePath();
  if (!existsSync(p)) return null;
  try { const f = JSON.parse(readFileSync(p, "utf8")); return { at: f.at || null, by: f.by || "unknown", reason: String(f.reason || "Frozen.") }; }
  catch { return { at: null, by: "unknown", reason: "frozen.json could not be read, so Reinpay stays frozen." }; }
}

/** Freeze, keeping the first freeze if one is already in place. Returns the freeze in force. */
export function freeze({ by = "owner", reason = "Frozen by the owner." } = {}) {
  const now = frozen();
  if (now) return now;
  const f = { at: new Date().toISOString(), by, reason: String(reason).slice(0, 300) };
  writePrivate(freezePath(), JSON.stringify(f, null, 1) + "\n");
  return f;
}

export function unfreeze() { const was = frozen(); rmSync(freezePath(), { force: true }); return was; }

/** The breaker setting from the rules: { count, minutes }, or null when the owner turned it off. */
export function breakerOf(rules) {
  const b = rules?.breaker;
  if (b === "off" || b === false) return null;
  const count = Number(b?.count ?? DEFAULT_BREAKER.count), minutes = Number(b?.minutes ?? DEFAULT_BREAKER.minutes);
  return count >= 1 && minutes >= 1 ? { count, minutes } : { ...DEFAULT_BREAKER };
}

/** Pure: has the agent been blocked `count` times within `minutes`? Returns { count, minutes, ids } or null. */
export function tripped(receipts, rules, now = Date.now()) {
  const b = breakerOf(rules);
  if (!b) return null;
  const since = now - b.minutes * 60_000;
  const hits = receipts.filter((r) => r.by === "agent" && r.status === "blocked" && r.rule !== "frozen" && r.createdAt >= since);
  return hits.length >= b.count ? { count: hits.length, minutes: b.minutes, ids: hits.map((r) => r.id) } : null;
}
