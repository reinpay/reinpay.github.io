// v0.29: reinpay connect snippets and reinpay mcp --check. The check starts a real MCP server over stdio (no network needed).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-connect-"));
const CN = await import("../src/connect.js");
let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
check("claude: one command", CN.snippet("claude").text === "claude mcp add --scope user reinpay -- reinpay mcp");
const cur = JSON.parse(CN.snippet("cursor", { readOnly: true, session: "USDG:5" }).text);
check("cursor: valid JSON with the flags as args", JSON.stringify(cur.mcpServers.reinpay.args) === '["mcp","--read-only","--session=USDG:5"]');
const vs = JSON.parse(CN.snippet("vscode").text);
check("vscode: a stdio server", vs.servers.reinpay.type === "stdio" && vs.servers.reinpay.command === "reinpay");
check("windsurf: valid JSON", !!JSON.parse(CN.snippet("windsurf").text).mcpServers.reinpay);
check("codex: TOML table with the args", /^\[mcp_servers\.reinpay\]\ncommand = "reinpay"\nargs = \["mcp"\]$/.test(CN.snippet("codex").text));
check("a profile gets its own server name and --profile", /reinpay-research -- reinpay mcp --profile=research$/.test(CN.snippet("claude", { profile: "research" }).text));
let e = null; try { CN.snippet("notepad"); } catch (x) { e = x; }
check("an unknown host says what to use instead", /Unknown host/.test(e?.message || "") && /stdio server/.test(e?.message || ""));
const bin = fileURLToPath(new URL("../bin/reinpay.js", import.meta.url));
const ok = await CN.checkServer(bin, [], { ...process.env });
check("mcp --check: a real server starts and lists 11 tools", ok.ok && ok.tools.length === 11, ok.detail);
const ro = await CN.checkServer(bin, ["--read-only"], { ...process.env });
check("mcp --check --read-only: 10 tools, no request_payment", ro.ok && ro.tools.length === 10 && !ro.tools.includes("request_payment"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
