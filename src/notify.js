// Tell the owner when a payment is waiting for them. Off unless the owner sets it up in their own terminal.
// Two kinds: a Telegram bot message (bot token + chat id), or a JSON POST to an https webhook the owner controls.
// A failed notification never changes a payment: it is logged on the receipt and that is all.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, HOME, writePrivate } from "./config.js";

const TIMEOUT_MS = 5_000;
const clip = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));

/** The text the owner reads. The memo comes from the agent, so it is shortened and quoted, never trusted. */
export function message(r, { memos = true } = {}) {
  const what = `${r.amount} ${r.token} to ${r.payee}`;
  return [
    `Reinpay: ${r.id} is waiting for you.`,
    `${what}${memos && r.memo ? `, memo "${clip(r.memo, 80)}"` : ""}.`,
    `${r.rule}: ${clip(r.reason, 200)}`,
    `In your terminal: reinpay approve ${r.id}  (or reinpay reject ${r.id})`,
  ].join("\n");
}

export const newSecret = () => randomBytes(32).toString("hex");

/** Webhook signature: hex HMAC-SHA256 of "<timestamp>.<body>" with the secret, sent as "sha256=<hex>". */
export const signWebhook = (secret, ts, body) => "sha256=" + createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

/** For the receiving server: true only for a matching signature made within `toleranceSec` of now. */
export function verifyWebhook(secret, ts, body, signature, { now = Date.now(), toleranceSec = 300 } = {}) {
  if (!secret || !ts || !signature || Math.abs(now / 1000 - Number(ts)) > toleranceSec) return false;
  const want = Buffer.from(signWebhook(secret, ts, body)), got = Buffer.from(String(signature));
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Validate a notify config from the CLI. Returns the object to store, or throws with a plain reason. */
export function parseNotify(kind, a, b) {
  if (kind === "off") return null;
  if (kind === "telegram") {
    if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(String(a || ""))) throw new Error("Telegram bot token looks wrong. It comes from @BotFather and looks like 123456789:ABC...");
    if (!/^-?\d{3,}$/.test(String(b || ""))) throw new Error("Telegram chat id must be a number (send /start to your bot, then read it from getUpdates).");
    return { type: "telegram", botToken: a, chatId: String(b) };
  }
  if (kind === "webhook") {
    let u;
    try { u = new URL(String(a)); } catch { throw new Error("Webhook must be a full URL."); }
    if (u.protocol !== "https:") throw new Error("Webhook must use https.");
    return { type: "webhook", url: u.toString(), secret: newSecret() };
  }
  throw new Error("Usage: reinpay notify telegram <bot-token> <chat-id> | webhook <https-url> | off | test");
}

/** Send one notification for a receipt. Resolves to { ok, detail }; never throws. `opts.fetch` and `opts.allowHttp` are for tests. */
/** One delivery attempt. Resolves to { ok, detail, retry } and never throws. */
async function attempt(f, url, n, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const raw = JSON.stringify(body), headers = { "content-type": "application/json" };
    if (n.type === "webhook" && n.secret) { const ts = String(Math.floor(Date.now() / 1000)); headers["x-reinpay-timestamp"] = ts; headers["x-reinpay-signature"] = signWebhook(n.secret, ts, raw); }
    const res = await f(url, { method: "POST", headers, body: raw, signal: ctl.signal });
    return res.ok ? { ok: true, detail: `${n.type} ${res.status}` } : { ok: false, detail: `${n.type} answered ${res.status}`, retry: res.status === 429 || res.status >= 500 };
  } catch (e) {
    return { ok: false, detail: `${n.type}: ${e.name === "AbortError" ? "no answer in 5 s" : e.message}`, retry: true };
  } finally { clearTimeout(timer); }
}

const logPath = () => join(HOME(), "notify-log.json");
export function readLog() { try { return existsSync(logPath()) ? JSON.parse(readFileSync(logPath(), "utf8")) : []; } catch { return []; } }
/** Keep the last 200 deliveries. Only the type and host are logged: never a bot token, a URL path or a secret. */
function logDelivery(entry) { try { writePrivate(logPath(), JSON.stringify([...readLog(), entry].slice(-200), null, 1) + "\n"); } catch { /* a log failure never changes a payment */ } }

/** Send one notification for a receipt, retrying up to 3 times on timeouts, 429 and 5xx. Resolves to { ok, detail, attempts }; never throws.
 *  `opts.fetch`, `opts.allowHttp` and `opts.sleep` are for tests. */
export async function notifyOwner(r, { cfg = loadConfig(), fetch: f = globalThis.fetch, allowHttp = false, text: override = null, event = "payment_waiting", sleep = (ms) => new Promise((res) => setTimeout(res, ms)), tries = 3 } = {}) {
  const n = cfg.notify;
  if (!n) return { ok: false, detail: "off" };
  const memos = !n.hideMemos;
  const text = override || message(r, { memos });
  let url, body;
  if (n.type === "telegram") {
    url = `${n.apiBase || "https://api.telegram.org"}/bot${n.botToken}/sendMessage`;
    body = { chat_id: n.chatId, text, disable_web_page_preview: true };
  } else if (n.type === "webhook") {
    url = n.url;
    if (!url.startsWith("https://") && !allowHttp) return { ok: false, detail: "webhook is not https" };
    body = { event, id: r.id, payee: r.payee, payeeAddress: r.payeeAddress, token: r.token, amount: r.amount, memo: memos ? clip(r.memo, 200) : null, rule: r.rule, reason: r.reason, status: r.status, text };
  } else return { ok: false, detail: "unknown notify type" };
  let res, k = 0;
  for (; k < tries; k++) {
    res = await attempt(f, url, n, body);
    if (res.ok || !res.retry) break;
    if (k < tries - 1) await sleep(1000 * 3 ** k); // 1 s, then 3 s
  }
  let host = ""; try { host = new URL(url).host; } catch {}
  logDelivery({ at: new Date().toISOString(), event, receipt: r.id || null, type: n.type, host, ok: res.ok, detail: res.detail, attempts: Math.min(k + 1, tries) });
  return { ok: res.ok, detail: res.detail, attempts: Math.min(k + 1, tries) };
}
