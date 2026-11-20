// Many agents, one owner. Each profile is its own wallet (see config.js); these helpers look across all of them:
// a one-screen overview, freezing or unfreezing every wallet at once, and one digest for the lot.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.js";

/** Profile names on this computer: "default" first, then the named ones. */
export function profileNames() {
  const out = ["default"], dir = join(ROOT(), "profiles");
  if (existsSync(dir)) for (const n of readdirSync(dir).sort()) if (/^[a-z0-9][a-z0-9-]{0,31}$/.test(n)) out.push(n);
  return out;
}

/** Run fn with REINPAY_PROFILE set to each profile in turn. REINPAY_HOME would override profiles, so it must be unset. */
export async function eachProfile(fn) {
  if (process.env.REINPAY_HOME) throw new Error("REINPAY_HOME is set, so there is only one wallet here; unset it to look across profiles.");
  const saved = process.env.REINPAY_PROFILE, out = [];
  try {
    for (const name of profileNames()) {
      process.env.REINPAY_PROFILE = name === "default" ? "" : name;
      out.push({ profile: name, ...(await fn(name)) });
    }
  } finally { if (saved === undefined) delete process.env.REINPAY_PROFILE; else process.env.REINPAY_PROFILE = saved; }
  return out;
}

/** One profile's summary, from local files only (no network). */
export async function summary() {
  const K = await import("./keystore.js"), RC = await import("./receipts.js"), F = await import("./freeze.js"), C = await import("./config.js"), R = await import("./rules.js"), CH = await import("./chain.js");
  const address = K.walletAddress();
  if (!address) return { address: null };
  const cfg = C.loadConfig(); CH.syncTokens(cfg);
  const rec = RC.allReceipts(), now = Date.now(), today = {};
  for (const t of Object.keys(CH.TOKENS)) {
    const { spent, held } = R.totals(rec, t, now);
    const daily = R.dailyLimit(cfg.rules, t, now);
    if (spent || held || daily) today[t] = { sent: R.fmt(spent, t), waiting: R.fmt(held, t), budget: daily === null ? null : R.fmt(daily, t) };
  }
  return { address, frozen: F.frozen(), unlocked: K.isUnlocked(), autoSend: !!cfg.rules.autoSend, waiting: rec.filter((r) => ["needs_approval", "ready"].includes(r.status)).length, blockedToday: rec.filter((r) => r.status === "blocked" && R.localDay(r.createdAt) === R.localDay(now)).length, today };
}

export function fleetText(rows) {
  const lines = [];
  for (const r of rows) {
    if (!r.address) { lines.push(`${r.profile.padEnd(14)} no wallet yet`); continue; }
    const flags = [r.frozen ? `FROZEN (${r.frozen.by})` : null, r.unlocked ? "unlocked" : "locked", r.autoSend ? "autosend on" : null].filter(Boolean).join(" · ");
    const spend = Object.entries(r.today).map(([t, v]) => `${v.sent} sent${v.budget ? ` of ${v.budget}` : ""}`).join(", ") || "nothing today";
    lines.push(`${r.profile.padEnd(14)} ${r.address.slice(0, 6)}…${r.address.slice(-4)}  ${flags}`);
    lines.push(`${"".padEnd(14)} today: ${spend} · ${r.waiting} waiting for you · ${r.blockedToday} blocked`);
  }
  const fz = rows.filter((r) => r.frozen).length, w = rows.reduce((a, r) => a + (r.waiting || 0), 0);
  lines.push("", `${rows.filter((r) => r.address).length} wallets · ${fz} frozen · ${w} payments waiting for you`);
  return lines.join("\n");
}
