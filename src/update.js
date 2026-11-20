// reinpay version --check and reinpay changelog. The check reads package.json from the public GitHub repo;
// it sends nothing about you or your wallet, and installing an update is always your own command.
import { readFileSync } from "node:fs";

export const LATEST_URL = "https://raw.githubusercontent.com/reinpay/reinpay/main/package.json";
export const UPDATE_CMD = "npm install -g https://github.com/reinpay/reinpay/archive/refs/heads/main.tar.gz";

/** -1, 0 or 1. Plain x.y.z only. */
export function compare(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) < (pb[i] || 0)) return -1; if ((pa[i] || 0) > (pb[i] || 0)) return 1; }
  return 0;
}

/** { current, latest, newer, detail } and never throws. `fetch` is for tests. */
export async function checkLatest(current, { fetch: f = globalThis.fetch } = {}) {
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    const res = await f(LATEST_URL, { signal: ctl.signal, headers: { "cache-control": "no-cache" } }); clearTimeout(t);
    if (!res.ok) return { current, latest: null, newer: false, detail: `GitHub answered ${res.status}` };
    const v = (await res.json()).version;
    if (!/^\d+\.\d+\.\d+$/.test(String(v))) return { current, latest: null, newer: false, detail: "GitHub did not give a version" };
    return { current, latest: v, newer: compare(current, v) < 0, detail: null };
  } catch (e) { return { current, latest: null, newer: false, detail: e.name === "AbortError" ? "GitHub did not answer in 8 s" : e.message }; }
}

/** Sections of CHANGELOG.md newer than `since` (all when no since). [{ version, text }] newest first. */
export function changelogSince(md, since = null) {
  const parts = md.split(/^## /m).slice(1).map((p) => { const version = (/^(\d+\.\d+\.\d+)/.exec(p) || [])[1]; return { version, text: "## " + p.trim() }; }).filter((p) => p.version);
  return since ? parts.filter((p) => compare(p.version, since) > 0) : parts;
}

export const readChangelog = () => readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
