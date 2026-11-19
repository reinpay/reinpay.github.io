// Tell the owner when a payment is waiting for them. Off unless the owner sets it up in their own terminal.
// Two kinds: a Telegram bot message (bot token + chat id), or a JSON POST to an https webhook the owner controls.
// A failed notification never changes a payment: it is logged on the receipt and that is all.
import { loadConfig } from "./config.js";

const TIMEOUT_MS = 5_000;
const clip = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));

/** The text the owner reads. The memo comes from the agent, so it is shortened and quoted, never trusted. */
export function message(r) {
  const what = `${r.amount} ${r.token} to ${r.payee}`;
  return [
    `Reinpay: ${r.id} is waiting for you.`,
    `${what}${r.memo ? `, memo "${clip(r.memo, 80)}"` : ""}.`,
    `${r.rule}: ${clip(r.reason, 200)}`,
    `In your terminal: reinpay approve ${r.id}  (or reinpay reject ${r.id})`,
  ].join("\n");
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
    return { type: "webhook", url: u.toString() };
  }
  throw new Error("Usage: reinpay notify telegram <bot-token> <chat-id> | webhook <https-url> | off | test");
}

/** Send one notification for a receipt. Resolves to { ok, detail }; never throws. `opts.fetch` and `opts.allowHttp` are for tests. */
export async function notifyOwner(r, { cfg = loadConfig(), fetch: f = globalThis.fetch, allowHttp = false } = {}) {
  const n = cfg.notify;
  if (!n) return { ok: false, detail: "off" };
  const text = message(r);
  let url, body;
  if (n.type === "telegram") {
    url = `${n.apiBase || "https://api.telegram.org"}/bot${n.botToken}/sendMessage`;
    body = { chat_id: n.chatId, text, disable_web_page_preview: true };
  } else if (n.type === "webhook") {
    url = n.url;
    if (!url.startsWith("https://") && !allowHttp) return { ok: false, detail: "webhook is not https" };
    body = { event: "payment_waiting", id: r.id, payee: r.payee, payeeAddress: r.payeeAddress, token: r.token, amount: r.amount, memo: clip(r.memo, 200), rule: r.rule, reason: r.reason, status: r.status, text };
  } else return { ok: false, detail: "unknown notify type" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await f(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    return res.ok ? { ok: true, detail: `${n.type} ${res.status}` } : { ok: false, detail: `${n.type} answered ${res.status}` };
  } catch (e) {
    return { ok: false, detail: `${n.type}: ${e.name === "AbortError" ? "no answer in 5 s" : e.message}` };
  } finally { clearTimeout(timer); }
}
