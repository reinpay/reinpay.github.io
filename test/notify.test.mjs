// Owner notifications, offline: the message, the settings check, and sending through a fake fetch (no network).
import { message, parseNotify, notifyOwner } from "../src/notify.js";
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const r = { id: "RP-00042", amount: "8", token: "USDG", payee: "GPU credits", payeeAddress: "0x00000000000000000000000000000000DeaDBeef", memo: "fine-tune run " + "x".repeat(200), rule: "approval line", reason: "8 USDG is above your approval line of 5 USDG.", status: "needs_approval" };

const m = message(r);
check("message names the id, amount, payee, rule and the approve command", /RP-00042 is waiting/.test(m) && /8 USDG to GPU credits/.test(m) && /approval line: 8 USDG/.test(m) && /reinpay approve RP-00042/.test(m));
check("the agent's memo is shortened", m.length < 500 && /…"/.test(m));
check("telegram settings are checked", parseNotify("telegram", "123456789:" + "A".repeat(35), "987654321").type === "telegram" && throws(() => parseNotify("telegram", "nope", "1"), /bot token/) && throws(() => parseNotify("telegram", "123456789:" + "A".repeat(35), "abc"), /chat id/));
check("webhooks must be https", parseNotify("webhook", "https://example.com/hook").url === "https://example.com/hook" && throws(() => parseNotify("webhook", "http://example.com/hook"), /https/));
check("off clears it", parseNotify("off") === null);

let seen = null;
const fake = (status) => async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return { ok: status < 300, status }; };
const tg = { notify: { type: "telegram", botToken: "123456789:" + "A".repeat(35), chatId: "987654321" } };
const a = await notifyOwner(r, { cfg: tg, fetch: fake(200) });
check("telegram: posts sendMessage to the bot with the chat id and the text", a.ok && seen.url === `https://api.telegram.org/bot${tg.notify.botToken}/sendMessage` && seen.body.chat_id === "987654321" && /RP-00042/.test(seen.body.text));
const wh = { notify: { type: "webhook", url: "https://example.com/hook" } };
const b = await notifyOwner(r, { cfg: wh, fetch: fake(200) });
check("webhook: posts JSON with the event, id, amount and payee", b.ok && seen.body.event === "payment_waiting" && seen.body.id === "RP-00042" && seen.body.amount === "8" && seen.body.payee === "GPU credits");
const c = await notifyOwner(r, { cfg: wh, fetch: fake(500) });
check("a server error is reported, not thrown", !c.ok && /500/.test(c.detail));
const d = await notifyOwner(r, { cfg: wh, fetch: async () => { throw new Error("connection refused"); } });
check("a network error is reported, not thrown", !d.ok && /connection refused/.test(d.detail));
const e = await notifyOwner(r, { cfg: { notify: { type: "webhook", url: "http://127.0.0.1:9/x" } }, fetch: fake(200) });
check("a stored http webhook is refused at send time too", !e.ok && /https/.test(e.detail));
const f = await notifyOwner(r, { cfg: {}, fetch: fake(200) });
check("off sends nothing", !f.ok && f.detail === "off");

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
