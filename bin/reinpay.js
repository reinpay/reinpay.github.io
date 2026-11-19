#!/usr/bin/env node
// The owner's terminal. Commands that create keys, approve payments or change rules refuse to run without a real terminal,
// so an agent driving a shell cannot use them.
import { readFileSync } from "node:fs";
import { generatePrivateKey } from "viem/accounts";

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--") && !a.includes("=")));
const opt = (k) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const pos = rest.filter((a) => !a.startsWith("--"));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const HELP = `reinpay ${pkg.version} - a wallet for AI agents that only spends inside your rules (Robinhood Chain mainnet, chain id 4663)

  reinpay mcp                              Run the MCP server on stdio (your agent host starts this)
  reinpay profiles                         List wallets on this computer (one per agent)
  --profile=<name>                         Use that agent's wallet for any command, e.g. reinpay init --profile=research
  reinpay init [--import]                  Create (or import) the encrypted wallet. Terminal only.
  reinpay address                          Print the wallet address
  reinpay status                           Balances, budgets left today and the rules
  reinpay unlock [--for=12h] | lock        Store (for a while) or remove the passphrase file the server signs with
  reinpay seal                             Check your rules, then seal them with your wallet key
  reinpay rules                            Show the rules
  reinpay rule <name> <token> <amount>     Set daily | weekly | monthly | max | approve-above for a token, e.g. reinpay rule daily USDG 50
                                           (weekly and monthly accept "off"; weeks start on Monday, local time)
  reinpay rule repeat-guard <minutes>      Hold repeats of the same payment for that long (0 turns it off)
  reinpay autosend <on|off>                Send payments that are inside every rule without asking (needs unlock)
  reinpay payee add <name> <0xaddress> [--tokens=USDG,ETH] [--note=...]
  reinpay payee list | remove <name> | off <name> | on <name>
  reinpay payee limit <name> <daily|max> <USDG|ETH> <amount|off>   A payee's own daily budget or max per payment
  reinpay pending                          Payments waiting for you
  reinpay approve <RP-id>                  Check the rules again, simulate again, then sign and send
  reinpay reject <RP-id>                   Refuse a waiting payment
  reinpay receipts [--status=sent] [--json | --csv]
  reinpay token add <0xaddress> | list | remove <SYMBOL>
                                           Spend another ERC-20 (checked on-chain and on Sourcify first)
  reinpay notify telegram <bot-token> <chat-id> | webhook <https-url> | off | test
                                           Tell you when a payment waits for your approval
  reinpay report [--days=7] [--json | --csv]   What was sent, waiting and blocked, per day, with top payees
  reinpay export                           Show the private key. Terminal only.
  reinpay --version`;

function requireTTY(what) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(`reinpay ${what} must be run by you in an interactive terminal, not by an agent.`);
    process.exit(2);
  }
}

function ask(q, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(q);
    let buf = "";
    stdin.setRawMode?.(true); stdin.resume(); stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") { stdin.setRawMode?.(false); stdin.pause(); stdin.off("data", onData); process.stdout.write("\n"); return resolve(buf); }
        if (ch === "\u0003") { process.stdout.write("\n"); process.exit(130); }
        if (ch === "\u007f" || ch === "\b") { if (buf.length) { buf = buf.slice(0, -1); if (!hidden) process.stdout.write("\b \b"); } continue; }
        buf += ch; if (!hidden) process.stdout.write(ch);
      }
    };
    stdin.on("data", onData);
  });
}

const line = (r) => `${r.id}  ${r.status.padEnd(14)} ${String(r.amount).padStart(12)} ${r.token.padEnd(4)}  ${r.payee}${r.memo ? `  "${r.memo}"` : ""}\n        ${r.rule}: ${r.reason}${r.explorer ? `\n        ${r.explorer}` : ""}`;

async function main() {
  // --profile=<name> picks one agent's wallet (each profile has its own key, rules, payees and receipts).
  if (opt("profile")) process.env.REINPAY_PROFILE = opt("profile");
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") return console.log(HELP);
  if (cmd === "--version" || cmd === "-v" || cmd === "version") return console.log(pkg.version);
  if (cmd === "mcp") { const { runServer } = await import("../src/server.js"); return runServer(); }

  if (cmd === "profiles") {
    const { readdirSync, existsSync, readFileSync: rf } = await import("node:fs");
    const { join } = await import("node:path");
    const { ROOT } = await import("../src/config.js");
    const addr = (dir) => { try { return JSON.parse(rf(join(dir, "keystore.json"), "utf8")).address || "?"; } catch { return "no wallet yet"; } };
    const rows = [["default", addr(ROOT())]];
    const pdir = join(ROOT(), "profiles");
    if (existsSync(pdir)) for (const n of readdirSync(pdir).sort()) rows.push([n, addr(join(pdir, n))]);
    return console.log(rows.map(([n, a]) => `${n.padEnd(20)} ${a}`).join("\n") + "\n\nUse one with --profile=<name>, e.g. reinpay mcp --profile=research");
  }
  const K = await import("../src/keystore.js");
  const P = await import("../src/pay.js");
  const C = await import("../src/config.js");

  if (cmd === "init") {
    requireTTY("init");
    if (K.keystoreExists()) return console.log(`A wallet already exists: ${K.walletAddress()}`);
    let pk = generatePrivateKey();
    if (flags.has("--import")) {
      pk = (await ask("Private key (0x..., hidden): ", { hidden: true })).trim();
      if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) { console.error("That is not a 32-byte hex private key."); process.exit(1); }
    }
    const a = await ask("New passphrase (10+ characters, hidden): ", { hidden: true });
    const b = await ask("Repeat passphrase: ", { hidden: true });
    if (a !== b) { console.error("The passphrases differ. Nothing was written."); process.exit(1); }
    const addr = K.writeKeystore(pk, a);
    await reseal(a);
    console.log(`Wallet created: ${addr}\nKeystore: ${C.paths().keystore}\nNext: add a payee (reinpay payee add), check the rules (reinpay rules), then fund the wallet with a small amount.`);
    return;
  }
  if (cmd === "address") return console.log(K.walletAddress() ?? "No wallet yet. Run reinpay init.");
  if (cmd === "unlock") {
    requireTTY("unlock");
    const f = opt("for") ?? "12h", m = /^(\d+)(m|h|d)?$/.exec(f);
    if (!m) throw new Error("Usage: reinpay unlock [--for=30m|2h|1d|0]  (0 keeps it unlocked until reinpay lock)");
    const ms = Number(m[1]) * ({ m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] || "m"]);
    K.unlock(await ask("Passphrase (hidden): ", { hidden: true }), ms);
    return console.log(`Unlocked${ms ? ` until ${new Date(Date.now() + ms).toLocaleString()}` : " until you run reinpay lock"}. The MCP server can now sign payments you approve, and those inside your rules if autosend is on.`);
  }
  if (cmd === "seal") {
    requireTTY("seal");
    console.log(JSON.stringify(P.rulesView(), null, 2));
    if ((await ask("Seal these rules and payees with your wallet key? Type yes: ")).trim().toLowerCase() !== "yes") return console.log("Not sealed.");
    return reseal();
  }
  if (cmd === "lock") { K.lock(); return console.log("Locked. The passphrase file is removed."); }
  if (cmd === "export") { requireTTY("export"); console.log(K.exportKey(await ask("Passphrase (hidden): ", { hidden: true }))); return; }
  if (cmd === "status") { const st = await P.walletStatus(); st.configSeal = await P.sealStatus(); st.unlockedUntil = K.isUnlocked() ? (K.unlockedUntil() ? new Date(K.unlockedUntil()).toISOString() : "until reinpay lock") : null; return console.log(JSON.stringify(st, null, 2)); }
  if (cmd === "rules") return console.log(JSON.stringify(P.rulesView(), null, 2));

  if (cmd === "rule") {
    requireTTY("rule");
    const cfg = C.loadConfig();
    const [name, a1, a2] = pos;
    if (name === "repeat-guard") {
      const m = Number(a1); if (!(m >= 0 && m <= 1440)) throw new Error("Minutes between 0 and 1440.");
      cfg.rules.repeatGuardMinutes = m;
    } else {
      const key = { daily: "daily", weekly: "weekly", monthly: "monthly", max: "maxPerPayment", "approve-above": "approveAbove" }[name];
      const tok = String(a1 || "").toUpperCase();
      const off = ["weekly", "monthly"].includes(name) && String(a2).toLowerCase() === "off";
      const { syncTokens } = await import("../src/chain.js");
      const known = Object.keys(syncTokens(cfg));
      if (!key || !known.includes(tok) || (!off && !/^\d+(\.\d+)?$/.test(String(a2 || "")))) throw new Error(`Usage: reinpay rule <daily|weekly|monthly|max|approve-above> <${known.join("|")}> <amount> (weekly and monthly also take off)`);
      if (off) { cfg.rules[key] = { ...(cfg.rules[key] || {}) }; delete cfg.rules[key][tok]; }
      else cfg.rules[key] = { ...(cfg.rules[key] || {}), [tok]: a2 };
    }
    C.saveConfig(cfg);
    return console.log(JSON.stringify(P.rulesView(), null, 2));
  }
  if (cmd === "autosend") {
    requireTTY("autosend");
    const on = pos[0] === "on"; if (!["on", "off"].includes(pos[0])) throw new Error("Usage: reinpay autosend <on|off>");
    const cfg = C.loadConfig(); cfg.rules.autoSend = on; C.saveConfig(cfg);
    return console.log(on ? `autosend is on. Payments inside every rule are sent without asking${K.isUnlocked() ? "." : ", once you run reinpay unlock."}` : "autosend is off. Every payment waits for reinpay approve.");
  }
  if (cmd === "payee") {
    const [sub, name, address] = pos;
    if (sub === "list" || !sub) return console.log(JSON.stringify(C.loadConfig().payees, null, 2));
    requireTTY("payee " + sub);
    if (sub === "add") {
      const tokens = opt("tokens") ? opt("tokens").toUpperCase().split(",") : undefined;
      const p = await P.addPayee({ name, address, tokens, note: opt("note") });
      return console.log(`Added ${p.name} ${p.address}${p.isContract ? " (a contract, not a personal wallet: make sure it can receive tokens)" : ""}.`);
    }
    if (sub === "remove") return console.log(`Removed ${P.removePayee(name).name}.`);
    if (sub === "off" || sub === "on") return console.log(`${P.setPayee(name, { disabled: sub === "off" }).name} is ${sub}.`);
    if (sub === "limit") {
      const [, , kind, tok, amount] = pos;
      const p = P.setPayeeLimit(name, kind, tok, amount);
      return console.log(`${p.name}: daily ${JSON.stringify(p.daily || {})}, max per payment ${JSON.stringify(p.maxPerPayment || {})}.`);
    }
    throw new Error("Usage: reinpay payee <add|list|remove|off|on|limit>");
  }
  if (cmd === "pending") {
    const list = [...P.listReceipts({ status: "needs_approval", limit: 200 }), ...P.listReceipts({ status: "ready", limit: 200 })];
    return console.log(list.length ? list.map(line).join("\n") : "Nothing is waiting for you.");
  }
  if (cmd === "approve") {
    requireTTY("approve");
    const id = pos[0]; if (!id) throw new Error("Usage: reinpay approve <RP-id>");
    const { getReceipt, view } = await import("../src/receipts.js");
    const r = getReceipt(id); if (!r) throw new Error(`No receipt ${id}.`);
    console.log(line(view(r)));
    if ((await ask("Approve and send this payment? Type yes: ")).trim().toLowerCase() !== "yes") return console.log("Not approved. Nothing was sent.");
    const pass = K.isUnlocked() ? undefined : await ask("Passphrase (hidden): ", { hidden: true });
    return console.log(line(await P.approve(id, { passphrase: pass })));
  }
  if (cmd === "reject") { requireTTY("reject"); return console.log(line(P.reject(pos[0]))); }
  if (cmd === "notify") {
    requireTTY("notify");
    const { parseNotify, notifyOwner } = await import("../src/notify.js");
    const cfg = C.loadConfig();
    if (pos[0] === "test") {
      if (!cfg.notify) throw new Error("Notifications are off. Set them up first: reinpay notify telegram <bot-token> <chat-id>");
      const n = await notifyOwner({ id: "RP-TEST", amount: "1", token: "USDG", payee: "Test", memo: "test message", rule: "test", reason: "This is a test from reinpay notify test.", status: "needs_approval" }, { cfg });
      return console.log(n.ok ? `Sent (${n.detail}).` : `Not sent: ${n.detail}`);
    }
    const n = parseNotify(pos[0], pos[1], pos[2]);
    if (n) cfg.notify = n; else delete cfg.notify;
    C.saveConfig(cfg);
    return console.log(n ? `Notifications on (${n.type}). Run reinpay notify test to check.` : "Notifications off.");
  }
  if (cmd === "report") {
    const { spendingReport, reportText } = await import("../src/report.js");
    const { allReceipts } = await import("../src/receipts.js");
    (await import("../src/chain.js")).syncTokens();
    const rep = spendingReport(allReceipts(), { days: opt("days") || 7 });
    if (flags.has("--csv")) return process.stdout.write((await import("../src/csv.js")).reportCSV(rep));
    return console.log(flags.has("--json") ? JSON.stringify(rep, null, 2) : reportText(rep));
  }
  if (cmd === "token") {
    const [sub, arg] = pos;
    const { syncTokens } = await import("../src/chain.js");
    if (sub === "list" || !sub) return console.log(JSON.stringify(Object.values(syncTokens()), null, 2));
    requireTTY("token " + sub);
    if (sub === "add") {
      const t = await P.addToken(arg);
      return console.log(`Added ${t.symbol} (${t.name}) at ${t.address}, ${t.decimals} decimals, Sourcify ${t.sourcify}.\nIt cannot be spent until you set a daily budget: reinpay rule daily ${t.symbol} <amount>`);
    }
    if (sub === "remove") return console.log(`Removed ${P.removeToken(arg)}. Its receipts stay.`);
    throw new Error("Usage: reinpay token <add <0xaddress>|list|remove <SYMBOL>>");
  }
  if (cmd === "receipts") {
    const list = P.listReceipts({ status: opt("status"), limit: 200 });
    if (flags.has("--csv")) {
      const { toCSV, RECEIPT_COLS } = await import("../src/csv.js");
      const { allReceipts, view } = await import("../src/receipts.js");
      const all = allReceipts().filter((r) => !opt("status") || r.status === opt("status")).map(view); // every receipt, oldest first
      return process.stdout.write(toCSV(all, RECEIPT_COLS));
    }
    return console.log(flags.has("--json") ? JSON.stringify(list, null, 2) : list.length ? list.map(line).join("\n") : "No receipts yet.");
  }
  console.error(`Unknown command "${cmd}".\n\n${HELP}`);
  process.exit(1);
}

// Commands that change rules, payees, tokens or notifications seal the config with the wallet key afterwards.
const MUTATING = ["rule", "autosend"].includes(cmd) || (cmd === "notify" && pos[0] !== "test") || (cmd === "payee" && ["add", "remove", "off", "on", "limit"].includes(pos[0])) || (cmd === "token" && ["add", "remove"].includes(pos[0]));
async function reseal(passphrase) {
  const K = await import("../src/keystore.js"), C = await import("../src/config.js"), { sealConfig } = await import("../src/seal.js");
  const pass = passphrase ?? (K.isUnlocked() ? undefined : await ask("Passphrase to seal your rules (hidden): ", { hidden: true }));
  const sealed = await sealConfig(C.loadConfig(), K.loadAccount(pass));
  C.saveConfig(sealed);
  console.log(`Rules sealed with your wallet key (${sealed.seal.at}).`);
}
main().then(() => (MUTATING ? reseal() : null)).catch((e) => { console.error(e?.shortMessage || e?.message || e); process.exit(1); });
