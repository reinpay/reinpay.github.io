// One spender at a time. Deciding a payment reads today's receipts, simulates, then writes a receipt; two processes doing
// that at the same moment could both see the same budget left. This lock makes that whole step one-at-a-time across
// every Reinpay process on the computer (MCP servers and the owner's terminal).
import { openSync, writeSync, closeSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { HOME, ensureDir } from "./config.js";

const STALE_MS = 120_000; // a holder that has not finished in 2 minutes is treated as gone (simulation + RPC fit well inside)
const WAIT_MS = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const lockPath = () => join(HOME(), "spend.lock");

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

/** Remove the lock file if its holder is gone or it is older than STALE_MS. Returns true if it removed one. */
export function clearStale(path = lockPath(), now = Date.now()) {
  let info = null, age = 0;
  try { info = JSON.parse(readFileSync(path, "utf8")); } catch {}
  try { age = now - statSync(path).mtimeMs; } catch { return false; }
  if ((info && !alive(info.pid)) || age > STALE_MS || (!info && age > 5_000)) {
    try { unlinkSync(path); return true; } catch { return false; }
  }
  return false;
}

function tryTake(path) {
  try {
    const fd = openSync(path, "wx", 0o600);
    writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
    closeSync(fd);
    return true;
  } catch (e) {
    if (e.code === "EEXIST") return false;
    throw e;
  }
}

/** Run fn while holding the spend lock. Waits up to 30 s for another Reinpay process to finish, then gives up. */
export async function withLock(fn, { waitMs = WAIT_MS } = {}) {
  ensureDir();
  const path = lockPath();
  const until = Date.now() + waitMs;
  let delay = 25;
  while (!tryTake(path)) {
    if (!clearStale(path)) {
      if (Date.now() > until) throw new Error(`Another Reinpay process is deciding a payment (${path}). Try again in a moment.`);
      await sleep(delay);
      delay = Math.min(delay * 2, 400);
    }
  }
  try { return await fn(); }
  finally { try { unlinkSync(path); } catch {} }
}
