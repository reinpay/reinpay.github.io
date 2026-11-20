// Session budgets: a cap on what one run of the MCP server may spend, on top of every other rule.
// `reinpay mcp --session=USDG:5,ETH:0.002` gives this server a session id; its requests carry it, and once the session
// has sent or is waiting on that much, further requests in that token are blocked. A new server run is a new session.
import { randomBytes } from "node:crypto";

/** "USDG:5,ETH:0.002" → { USDG: "5", ETH: "0.002" }. Throws with a plain reason. */
export function parseSession(spec) {
  const out = {};
  for (const part of String(spec || "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = /^([A-Za-z0-9]{1,11}):(\d+(?:\.\d+)?)$/.exec(part);
    if (!m) throw new Error(`"${part}" is not TOKEN:amount, e.g. USDG:5`);
    out[m[1].toUpperCase()] = m[2];
  }
  if (!Object.keys(out).length) throw new Error("Give at least one cap, e.g. --session=USDG:5");
  return out;
}

export const newSession = (caps) => ({ id: "S-" + randomBytes(4).toString("hex"), caps, startedAt: new Date().toISOString() });
