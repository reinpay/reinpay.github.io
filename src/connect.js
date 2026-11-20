// reinpay connect <host>: the exact snippet to add Reinpay to an agent host, and reinpay mcp --check to test the server.
// It only prints; it never edits a host's config file for you.
export const HOSTS = ["claude", "cursor", "vscode", "windsurf", "codex"];

export function mcpArgs({ profile, readOnly, session } = {}) {
  return ["mcp", ...(readOnly ? ["--read-only"] : []), ...(session ? [`--session=${session}`] : []), ...(profile ? [`--profile=${profile}`] : [])];
}

/** { where, text } for a host. */
export function snippet(host, opts = {}) {
  const args = mcpArgs(opts), name = opts.profile ? `reinpay-${opts.profile}` : "reinpay";
  const json = (o) => JSON.stringify(o, null, 2);
  switch (host) {
    case "claude": return { where: "Run in your terminal:", text: `claude mcp add --scope user ${name} -- reinpay ${args.join(" ")}` };
    case "cursor": return { where: "Add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project):", text: json({ mcpServers: { [name]: { command: "reinpay", args } } }) };
    case "windsurf": return { where: "Add to ~/.codeium/windsurf/mcp_config.json:", text: json({ mcpServers: { [name]: { command: "reinpay", args } } }) };
    case "vscode": return { where: "Add to .vscode/mcp.json in your project:", text: json({ servers: { [name]: { type: "stdio", command: "reinpay", args } } }) };
    case "codex": return { where: "Add to ~/.codex/config.toml:", text: `[mcp_servers.${name.replace(/-/g, "_")}]\ncommand = "reinpay"\nargs = [${args.map((a) => JSON.stringify(a)).join(", ")}]` };
    default: throw new Error(`Unknown host "${host}". Use one of: ${HOSTS.join(", ")}. Any other MCP host: a stdio server with the command reinpay ${args.join(" ")}`);
  }
}

/** Start `reinpay mcp` the way a host would and list its tools. Resolves to { ok, tools, detail }. */
export async function checkServer(binPath, extraArgs = [], env = process.env) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const c = new Client({ name: "reinpay-check", version: "0.0.0" });
  try {
    await c.connect(new StdioClientTransport({ command: process.execPath, args: [binPath, "mcp", ...extraArgs], env }));
    const tools = (await c.listTools()).tools.map((t) => t.name).sort();
    return { ok: tools.length > 0, tools, detail: `${tools.length} tools` };
  } catch (e) { return { ok: false, tools: [], detail: e.message }; }
  finally { await c.close().catch(() => {}); }
}
