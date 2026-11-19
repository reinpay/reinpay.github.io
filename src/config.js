// Everything Reinpay keeps lives in ~/.reinpay (or $REINPAY_HOME), readable by the owner only.
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync, renameSync } from "node:fs";

// Profiles: one wallet per agent. The default profile lives in ~/.reinpay; a named one in ~/.reinpay/profiles/<name>,
// each with its own key, rules, payees, receipts and spend lock.
export const PROFILE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const ROOT = () => join(homedir(), ".reinpay");
export function profileName() {
  const p = process.env.REINPAY_PROFILE;
  if (!p || p === "default") return null;
  if (!PROFILE_RE.test(p)) throw new Error(`Profile "${p}": use 1-32 lowercase letters, digits or dashes.`);
  return p;
}
export const HOME = () => process.env.REINPAY_HOME || (profileName() ? join(ROOT(), "profiles", profileName()) : ROOT());
export const paths = () => ({
  dir: HOME(),
  keystore: join(HOME(), "keystore.json"),
  passphrase: join(HOME(), "passphrase"),
  unlock: join(HOME(), "unlock.json"),
  config: join(HOME(), "config.json"),
  receipts: join(HOME(), "receipts.json"),
});

export function ensureDir() {
  mkdirSync(HOME(), { recursive: true, mode: 0o700 });
  try { chmodSync(HOME(), 0o700); } catch {}
}

/** Atomic write: a crash never leaves half a file. */
export function writePrivate(path, text) {
  ensureDir();
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, path);
}

// Conservative defaults: small budgets, nobody on the payee list, and every payment waits for the owner.
export const DEFAULT_CONFIG = {
  rpc: null,
  rules: {
    daily: { USDG: 25, ETH: 0.005 },
    maxPerPayment: { USDG: 10, ETH: 0.002 },
    approveAbove: { USDG: 5, ETH: 0.001 },
    repeatGuardMinutes: 10,
    autoSend: false,
  },
  payees: [],
};

export function loadConfig() {
  const p = paths().config;
  if (!existsSync(p)) return structuredClone(DEFAULT_CONFIG);
  try {
    const c = JSON.parse(readFileSync(p, "utf8"));
    return { ...structuredClone(DEFAULT_CONFIG), ...c, rules: { ...DEFAULT_CONFIG.rules, ...(c.rules || {}) } };
  } catch {
    throw new Error(`${p} is not valid JSON. Fix or delete it; Reinpay will not guess your rules.`);
  }
}

export function saveConfig(cfg) {
  writePrivate(paths().config, JSON.stringify(cfg, null, 2) + "\n");
}
