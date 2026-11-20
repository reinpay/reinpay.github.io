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

  reinpay sandbox                          Try Reinpay with no money: real rules, real mainnet simulation, pretend balance
  reinpay lab run [--out=run.json] [--json]   Reinpay Lab: scams against throwaway wallets with five rule sets, nothing signed
  reinpay connect <claude|cursor|vscode|windsurf|codex> [--read-only] [--session=USDG:5]   The snippet to add Reinpay to your agent host
  reinpay prompt [--read-only] [--out=file.md]   Instructions to paste into your agent: how to use the tools safely, and your rules in plain words
  reinpay mcp --check                      Start the MCP server the way a host does, and list its tools
  reinpay mcp [--read-only] [--session=USDG:5,ETH:0.002]   Run the MCP server on stdio; --read-only leaves out request_payment;
                                           --session caps what this one run may spend in all
  reinpay profiles [--status]              List wallets on this computer (one per agent); --status: today's spend, waiting, frozen
  --profile=<name>                         Use that agent's wallet for any command, e.g. reinpay init --profile=research
  reinpay init [--import]                  Create (or import) the encrypted wallet. Terminal only.
  reinpay address                          Print the wallet address
  reinpay status                           Balances, budgets left today and the rules
  reinpay today [--json]                   One screen: budget bars per token, what waits for you, blocks, next bills, brakes
  reinpay headroom [--json]                What the agent could still pay each payee now: without you, with your yes, and what stops it
  reinpay why <RP-id> [--json]             Replay one past decision rule by rule, with the rules sealed at the time
  reinpay unlock [--for=12h] | lock        Store (for a while) or remove the passphrase file the server signs with
  reinpay seal                             Check your rules, then seal them with your wallet key
  reinpay rules                            Show the rules
  reinpay rules --plain                    The rules as plain sentences
  reinpay rules history [--last=10] [--json]   Every change to the rules and payees, signed and chained; checks the chain
  reinpay rules template [cautious|balanced|open]   A ready rule set as the commands to run, compared with yours (prints only)
  reinpay rules export [--out=file.json]   Your rules in a file signed with your wallet key (no grants, co-signer or autosend)
  reinpay rules import <file.json>         Check the signature, show every change, apply after you type yes
  reinpay rule <name> <token> <amount>     Set daily | weekly | monthly | max | approve-above for a token, e.g. reinpay rule daily USDG 50
                                           (weekly and monthly accept "off"; weeks start on Monday, local time)
  reinpay rule repeat-guard <minutes>      Hold repeats of the same payment for that long (0 turns it off)
  reinpay rule breaker <count> <minutes> | off   Freeze when the agent is blocked that often (default 5 in 10 minutes)
  reinpay rule first-payment <ask|off>     Make the first payment to every payee wait for you
  reinpay rule memo <min-chars|off>        Block requests whose memo does not say what they are for
  reinpay rule memo-block <add|remove> <word ...> | off   Block requests whose memo contains a word you name (e.g. airdrop, claim)
  reinpay rule usd max|daily <amount|off>  Limits in dollars across USDG and ETH (ETH priced from two on-chain pools)
  reinpay price                            The ETH price in USDG the USD rules would use right now
  reinpay rule expire-after <24h|90m|off>  Waiting payments expire after this long and stop holding the budget
  reinpay rule hours <9-18|off> [--weekdays]   Outside these local hours, every payment waits for you
  reinpay rule per-hour <count|0>          At most this many payments sent or waiting in any hour
  reinpay rule per-day <count|0>           At most this many payments sent or waiting per day (resets at local midnight)
  reinpay rule balance-share <percent|off> One payment may be at most this share of the wallet balance of that token (read from the chain)
  reinpay rule category <name> daily <token> <amount|off>   A daily budget for every payee in a category
  reinpay payee category <payee> <name|off>    Put a payee in a category (e.g. compute, data, api)
  reinpay payee challenge <payee>          The message the payee signs to prove they control their address
  reinpay payee prove <payee> <0xsignature>    Record the payee's proof
  reinpay rule require-proven <on|off>     Payments to payees without a proof wait for you
  reinpay rule cosign <0xaddress> <token> <amount> | off   Above this, a second person must co-sign too
  reinpay rule max-fee <eth|off>           Block a payment while the network fee is above this (e.g. 0.0001)
  reinpay cosign-message <RP-id>           The text the co-signer signs; then reinpay approve <RP-id> --cosig=0x…
  reinpay grant <token> <amount> --for=2h [--note=...]   Extra budget for a while, on top of the daily budget
  reinpay grant list | clear               Show or remove grants
  reinpay check <payee> <amount> [token]   Dry run: what would happen to this payment now (nothing recorded or signed)
  reinpay check <payee> <amount> [token] --explain   The same, with every rule in order and the one that decided
  reinpay check --plan=payments.json      A list of payments checked in order, as if all were asked for now (nothing recorded)
  reinpay freeze [reason] [--all]          Stop every payment now (requests, autosend, approvals); --all: every profile
  reinpay unfreeze [--all]                 Start again after checking reinpay receipts. Terminal only.
  reinpay autosend <on|off>                Send payments that are inside every rule without asking (needs unlock)
  reinpay payee add <name> <0xaddress> [--tokens=USDG,ETH] [--note=...] [--until=30d] [--yes] [--no-check]
                                           Runs payee check first; asks before adding a fresh address or a contract
  reinpay payee until <name> <30d|12h|off> A payee that expires on its own
  reinpay payee export [--out=file.json]   Your payee list, signed with your wallet key, to share
  reinpay payee import <file.json>         Add payees from a signed list, after the same checks as payee add
  reinpay payee check <0xaddress>         Read an address from the chain before you add it: wallet or contract, history, Sourcify, lookalikes
  reinpay payee rename <name> <new name>  Rename a payee (and the schedules that pay it); the address and limits stay
  reinpay payee cooldown <name> <minutes|off>   At least this long between payments to one payee (sent or waiting)
  reinpay payee list | remove <name> | off <name> | on <name>
  reinpay payee limit <name> <daily|max|ask-above> <USDG|ETH> <amount|off>   A payee's own daily budget, max per payment or approval line
  reinpay pending                          Payments waiting for you
  reinpay approve <RP-id> [RP-id ...] | --all   Check the rules again, simulate again, then sign and send (one yes for all)
  reinpay approve <RP-id> ... | --all --dry   Everything approve checks, fresh now, then stop before signing
  reinpay reject <RP-id>                   Refuse a waiting payment
  reinpay receipts [--status=sent] [--payee=] [--token=] [--since=2026-11-01] [--until=] [--min=] [--max=] [--memo=] [--rule=] [--json | --csv]
  reinpay verify <RP-id> | --all [--json]  Read sent payments back from the chain and check them against their receipts
  reinpay statement [--days=30] [--out=file.json] [--no-memos]   A spending statement signed with your wallet key
  reinpay redact <RP-id> [--reason=...]    Remove a receipt's memo for good (terminal only)
  reinpay statement check <file.json>      Check anyone's statement: the signature, then every payment on the chain
  reinpay share <RP-id> [--out=file.json]  A signed proof of one sent payment, for the payee or anyone
  reinpay share check <file.json>          Check a shared receipt: the signature, then the payment on the chain
  reinpay schedule add <payee> <amount> <token> <daily|weekly|monthly> [--start=2026-12-01T09:00] [--memo=...]
  reinpay schedule list | remove <id> | pause <id> | resume <id>
  reinpay schedule run                     Ask for every payment that is due (put this on cron); rules still apply
  reinpay pay <ethereum:… link> [--memo=...]   Ask for a payment from a payment link (EIP-681); payee must be on your list
  reinpay link <payee> <amount> [token]    Make a payment link for a payee on your list
  reinpay digest [--days=1] [--dry] [--all]        Send a short spending summary to your Telegram or webhook (for a daily schedule)
  reinpay backup [--out=file.json]         Everything needed to move this wallet: key (still encrypted), rules, payees, receipts
  reinpay restore <file.json>              Restore a backup into an empty wallet or profile. Terminal only.
  reinpay review [--days=30] [--json]      Suggestions for your rules from your own receipts (changes nothing)
  reinpay doctor [--json]                  Check this computer's setup: Node, RPC, chain, wallet, seal, unlock, gas money, payees, budgets
  reinpay token add <0xaddress> | list | remove <SYMBOL>
                                           Spend another ERC-20 (checked on-chain and on Sourcify first)
  reinpay notify telegram <bot-token> <chat-id> | webhook <https-url> | secret | at <percent|off> | memos <on|off> | log | off | test
                                           Webhooks are signed: x-reinpay-signature (HMAC-SHA256); secret makes a new key
                                           Tell you when a payment waits for your approval
  reinpay books --month=2026-11 [--csv | --json]    One month of sent payments for your books, with USD values and fees
  reinpay report [--days=7] [--json | --csv | --html [--out=report.html]]   What was sent, waiting and blocked, per day, with top payees
  reinpay export                           Show the private key. Terminal only.
  reinpay selftest [--live] [--json]       Run Reinpay's own tests on this computer (your ~/.reinpay is not touched)
  reinpay --version [--check]              The installed version; --check asks GitHub whether a newer one is out
  reinpay changelog [--since=0.20.0]       What changed, from the installed CHANGELOG`;

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
  if ((cmd === "--version" || cmd === "-v" || cmd === "version") && !flags.has("--check")) return console.log(pkg.version);
  if ((cmd === "--version" || cmd === "version") && flags.has("--check")) {
    const U = await import("../src/update.js");
    const r = await U.checkLatest(pkg.version);
    if (!r.latest) { console.log(`reinpay ${pkg.version}. Could not check for a newer version: ${r.detail}.`); return; }
    if (!r.newer) return console.log(`reinpay ${pkg.version} is the latest.`);
    const news = U.changelogSince(U.readChangelog(), pkg.version);
    return console.log(`reinpay ${pkg.version} is installed; ${r.latest} is out.\nUpdate with:\n  ${U.UPDATE_CMD}\nThen run reinpay changelog --since=${pkg.version} to see what changed.${news.length ? "" : ""}`);
  }
  if (cmd === "changelog") {
    const U = await import("../src/update.js");
    const list = U.changelogSince(U.readChangelog(), opt("since") || null);
    return console.log(list.length ? list.map((x) => x.text).join("\n\n") : `Nothing newer than ${opt("since")}.`);
  }
  if (cmd === "connect") {
    const { snippet, HOSTS } = await import("../src/connect.js");
    const hosts = pos[0] ? [pos[0]] : HOSTS;
    const o = { profile: process.env.REINPAY_PROFILE || null, readOnly: flags.has("--read-only"), session: opt("session") || null };
    if (o.session) (await import("../src/session.js")).parseSession(o.session);
    for (const h of hosts) { const x = snippet(h, o); console.log(`${h}\n${x.where}\n${x.text}\n`); }
    return console.log("Then restart the host and ask it to call get_rules. Check the server any time with: reinpay mcp --check");
  }
  if (cmd === "mcp" && flags.has("--check")) {
    const { checkServer } = await import("../src/connect.js");
    const { fileURLToPath } = await import("node:url");
    const extra = rest.filter((a) => a !== "--check" && a !== "mcp");
    const r = await checkServer(fileURLToPath(import.meta.url), extra);
    console.log(r.ok ? `The MCP server starts and offers ${r.detail}: ${r.tools.join(", ")}.` : `The MCP server did not start: ${r.detail}`);
    if (!r.ok) process.exitCode = 1;
    return;
  }
  if (cmd === "sandbox") { await (await import("../src/sandbox.js")).runSandbox(); return; }
  if (cmd === "mcp") { const { runServer } = await import("../src/server.js"); return runServer({ readOnly: flags.has("--read-only"), session: opt("session") ? (await import("../src/session.js")).parseSession(opt("session")) : null }); }

  if (cmd === "profiles" && flags.has("--status")) {
    const FL = await import("../src/fleet.js");
    const rows = await FL.eachProfile(() => FL.summary());
    return console.log(flags.has("--json") ? JSON.stringify(rows, null, 2) : FL.fleetText(rows));
  }
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
  if (cmd === "freeze" && flags.has("--all")) {
    const FL = await import("../src/fleet.js");
    const reason = pos.join(" ") || "Frozen by the owner (all wallets).";
    const rows = await FL.eachProfile(async () => { const K2 = await import("../src/keystore.js"); if (!K2.walletAddress()) return { skipped: true }; const F = await import("../src/freeze.js"); const was = F.frozen(); F.freeze({ by: "owner", reason }); return { was: !!was }; });
    return console.log(rows.map((r) => `${r.profile.padEnd(14)} ${r.skipped ? "no wallet" : r.was ? "already frozen" : "frozen"}`).join("\n") + "\n\nEvery wallet on this computer is frozen. Unfreeze one with reinpay unfreeze --profile=<name>, or all with reinpay unfreeze --all.");
  }
  if (cmd === "unfreeze" && flags.has("--all")) {
    requireTTY("unfreeze");
    const FL = await import("../src/fleet.js");
    const rows = await FL.eachProfile(async () => ({ f: (await import("../src/freeze.js")).frozen() }));
    const frozen = rows.filter((r) => r.f);
    if (!frozen.length) return console.log("No wallet is frozen.");
    for (const r of frozen) console.log(`${r.profile.padEnd(14)} frozen since ${r.f.at} by ${r.f.by}: ${r.f.reason}`);
    if ((await ask(`Did you check the receipts of these ${frozen.length}? Type yes to unfreeze them all: `)).trim().toLowerCase() !== "yes") return console.log("Still frozen.");
    await FL.eachProfile(async (n) => { if (frozen.some((r) => r.profile === n)) (await import("../src/freeze.js")).unfreeze(); return {}; });
    return console.log(`Unfrozen ${frozen.length}.`);
  }
  if (cmd === "freeze") {
    const F = await import("../src/freeze.js");
    const was = F.frozen();
    const f = F.freeze({ by: "owner", reason: pos.join(" ") || "Frozen by the owner." });
    return console.log(was ? `Already frozen since ${was.at} (${was.reason}).` : `Frozen. Every payment request is blocked, autosend stops and approvals are refused.\nCheck reinpay receipts, then run reinpay unfreeze when you are ready.`);
  }
  if (cmd === "unfreeze") {
    requireTTY("unfreeze");
    const F = await import("../src/freeze.js");
    const f = F.frozen();
    if (!f) return console.log("Not frozen.");
    console.log(`Frozen since ${f.at} by ${f.by}: ${f.reason}`);
    if ((await ask("Did you check reinpay receipts? Type yes to unfreeze: ")).trim().toLowerCase() !== "yes") return console.log("Still frozen.");
    F.unfreeze();
    return console.log("Unfrozen. Payments follow your rules again.");
  }
  if (cmd === "lock") { K.lock(); return console.log("Locked. The passphrase file is removed."); }
  if (cmd === "export") { requireTTY("export"); console.log(K.exportKey(await ask("Passphrase (hidden): ", { hidden: true }))); return; }
  if (cmd === "status") { const st = await P.walletStatus(); st.configSeal = await P.sealStatus(); st.unlockedUntil = K.isUnlocked() ? (K.unlockedUntil() ? new Date(K.unlockedUntil()).toISOString() : "until reinpay lock") : null; st.frozen = (await import("../src/freeze.js")).frozen(); return console.log(JSON.stringify(st, null, 2)); }
  if (cmd === "rules" && pos[0] === "export") {
    const RS = await import("../src/ruleshare.js"); const { writeFileSync: wf, existsSync: ex } = await import("node:fs");
    if (!K.isUnlocked()) requireTTY("rules export");
    const f = await RS.exportRules(C.loadConfig().rules, K.loadAccount(K.isUnlocked() ? undefined : await ask("Passphrase to sign the rules (hidden): ", { hidden: true })));
    const out = opt("out") || "reinpay-rules.json";
    if (ex(out) && !flags.has("--force")) throw new Error(`${out} already exists. Use --out=<file> or --force.`);
    wf(out, JSON.stringify(f, null, 2) + "\n");
    return console.log(`Wrote ${out}: ${Object.keys(f.rules).length} rule settings, signed by ${f.by}. Grants, the co-signer and autosend are not in it.\nOn the other wallet: reinpay rules import ${out}`);
  }
  if (cmd === "rules" && pos[0] === "import") {
    requireTTY("rules import");
    const RS = await import("../src/ruleshare.js"); const { readFileSync: rf } = await import("node:fs");
    let f; try { f = JSON.parse(rf(pos[1] || "", "utf8")); } catch { throw new Error(pos[1] ? `${pos[1]} is not a readable JSON file.` : "Usage: reinpay rules import <file.json>"); }
    const c = await RS.checkRulesFile(f);
    if (!c.ok) { console.log(`Not imported: ${c.reason}. Nothing changed.`); process.exit(1); }
    const me = P.requireWallet(), cfg = C.loadConfig(), plan = RS.planRulesImport(f, cfg.rules);
    console.log(`Rules file ${c.reason}${c.signer === me ? " (this wallet)" : ""}, made ${f.at}.`);
    if (!plan.changes.length) { console.log("Your rules already match it. Nothing changed."); process.exit(0); }
    console.log("It would change:"); const w = Math.max(...plan.changes.map((x) => x.path.length));
    for (const x of plan.changes) console.log(`  ${x.path.padEnd(w)}  ${x.before === undefined ? "(none)" : typeof x.before === "string" ? x.before : JSON.stringify(x.before)} → ${x.after === undefined ? "(off)" : typeof x.after === "string" ? x.after : JSON.stringify(x.after)}`);
    if ((await ask("Apply these rules? Type yes: ")).trim().toLowerCase() !== "yes") { console.log("Not imported. Nothing changed."); process.exit(1); }
    C.saveConfig({ ...cfg, rules: plan.rules });
    return console.log(`Imported ${plan.changes.length} change${plan.changes.length === 1 ? "" : "s"}.`);
  }
  if (cmd === "rules" && pos[0] === "template") {
    const T = await import("../src/templates.js");
    if (!pos[1]) { console.log("Rule templates (reinpay rules template <name> prints the commands):"); for (const [n, t] of Object.entries(T.TEMPLATES)) console.log(`  ${n.padEnd(9)} ${t.about}`); return; }
    const cmds = T.commandsFor(pos[1]), diff = T.compare(C.loadConfig().rules, pos[1]);
    if (flags.has("--json")) return console.log(JSON.stringify({ template: pos[1], commands: cmds, changes: diff }, null, 2));
    console.log(`Template "${pos[1]}": ${T.TEMPLATES[pos[1]].about}.`);
    console.log(diff.length ? "Compared with your rules now:" : "Your rules already match it.");
    const w = Math.max(0, ...diff.map((d) => d.what.length)); for (const d of diff) console.log(`  ${d.what.padEnd(w)}  ${d.now} → ${d.then}`);
    console.log("\nTo use it, run these in your own terminal (each one is sealed with your key):"); for (const c of cmds) console.log("  " + c);
    return console.log("\nNothing was changed.");
  }
  if (cmd === "rules" && pos[0] === "history") {
    const H = await import("../src/history.js");
    const h = H.loadHistory(), v = await H.verifyHistory(h, P.requireWallet(), C.loadConfig());
    if (flags.has("--json")) return console.log(JSON.stringify({ ok: v.ok, problems: v.problems, entries: (h || []).map(({ body, sig, ...e }) => e) }, null, 2));
    if (!h || !h.length) return console.log("No history yet. It starts with the next change you make (reinpay rule, payee, notify, ...).");
    const last = Number(opt("last") || 10);
    console.log(`Rules history: ${h.length} entr${h.length === 1 ? "y" : "ies"}${h.length > last ? `, the last ${last}` : ""}.`);
    for (const l of H.historyLines(h, { last })) console.log(l);
    return console.log(v.ok ? `\nEvery entry is signed by this wallet and follows the one before it. The rules sealed now are the last entry.` : `\nProblems:\n${v.problems.map((p) => "  " + p).join("\n")}`);
  }
  if (cmd === "rules" && flags.has("--plain")) { const { plainRules } = await import("../src/plain.js"); const lines = plainRules(C.loadConfig(), { frozen: (await import("../src/freeze.js")).frozen() }); return console.log(lines.join("\n")); }
  if (cmd === "rules") return console.log(JSON.stringify(P.rulesView(), null, 2));
  if (cmd === "why") {
    if (!pos[0]) throw new Error("Usage: reinpay why <RP-id>");
    const { getReceipt } = await import("../src/receipts.js"); const r = getReceipt(pos[0]); if (!r) throw new Error(`No receipt ${pos[0]}.`);
    const w = await P.whyView(pos[0]);
    if (flags.has("--json")) return console.log(JSON.stringify(w, null, 2));
    const { explainLines } = await import("../src/explain.js");
    console.log(`${r.id}  ${r.amount} ${r.token} to ${r.payee}, asked ${new Date(r.createdAt).toISOString().slice(0, 19).replace("T", " ")}, now ${r.status}`);
    console.log(w.source === "history" ? `Replayed with the rules sealed at ${w.at.slice(0, 19).replace("T", " ")} and the payments before it:` : "Replayed with today's rules (the rules history does not reach back this far) and the payments before it:");
    for (const l of explainLines(w.steps)) console.log(l);
    return console.log(`\n${w.note}`);
  }
  if (cmd === "prompt") {
    const { agentPrompt } = await import("../src/prompt.js");
    const text = agentPrompt(C.loadConfig(), { readOnly: flags.has("--read-only"), frozen: (await import("../src/freeze.js")).frozen() });
    if (opt("out")) { const { writeFileSync: wf, existsSync: ex } = await import("node:fs"); if (ex(opt("out")) && !flags.has("--force")) throw new Error(`${opt("out")} already exists. Use --force.`); wf(opt("out"), text + "\n"); return console.log(`Wrote ${opt("out")}: paste it into your agent's instructions. It holds your rules as they are now; run reinpay prompt again after you change them.`); }
    return console.log(text);
  }
  if (cmd === "selftest") {
    const { runSelftest } = await import("../src/selftest.js");
    const json = flags.has("--json");
    if (!json) console.log(`Running Reinpay's own tests on this computer${flags.has("--live") ? ", the mainnet ones too (reads and simulations only)" : " (offline)"}. Your ~/.reinpay is not touched.`);
    const r = runSelftest({ live: flags.has("--live"), onFile: (x) => { if (!json) console.log(`  ${x.ok ? "✓" : "✗"} ${x.file.padEnd(26)} ${String(x.pass).padStart(3)} passed${x.fail ? `, ${x.fail} failed` : ""}${x.error ? `  (${x.error})` : ""}`); } });
    if (json) return console.log(JSON.stringify(r, null, 2));
    for (const x of r.results) for (const f of x.failures) console.log(`  FAIL ${x.file}: ${f}`);
    console.log(`\n${r.files} files, ${r.pass} checks passed, ${r.fail} failed, in ${r.seconds} s. ${r.ok ? "Reinpay works on this computer." : "Something is wrong: run the failing file with node to see more."}`);
    if (!r.ok) process.exit(1);
    return;
  }
  if (cmd === "lab" && pos[0] === "run") {
    const { runLab, ROWS } = await import("../src/lab.js");
    const json = flags.has("--json"), out = opt("out");
    if (!json) console.log("Reinpay Lab: every attack against every rule set, on throwaway wallets. Real rules, real mainnet simulations, nothing signed.");
    const run = await runLab({ onCell: (c, row, a) => { if (!json) console.log(`  ${row.label.padEnd(9)} ${a.label.padEnd(18)} ${c.outcome.toUpperCase().padEnd(8)} ${c.rule || (c.outcome === "paid" ? "rules let it through" : "")}${c.requests > 1 ? `  [${c.paid} paid, ${c.held} held, ${c.blocked} blocked of ${c.requests}]` : ""}${c.voided ? ` (${c.voided} void)` : ""}`); } });
    if (out) { const { writeFileSync: wf } = await import("node:fs"); wf(out, JSON.stringify(run, null, 1) + "\n"); }
    if (json) return console.log(JSON.stringify(run, null, 2));
    return console.log(`\nBlock ${run.block}. ${run.totals.blocked} blocked, ${run.totals.held} held for the owner, ${run.totals.paid} would pay, ${run.totals.void} void.${out ? ` Written to ${out}.` : ""}`);
  }
  if (cmd === "headroom") { const h = await P.headroomView(); if (flags.has("--json")) return console.log(JSON.stringify(h.rows, null, 2)); console.log("What the agent could ask for right now, per payee:"); for (const l of h.lines) console.log(l); return console.log("\nWorked out by the same rules that decide every payment. The repeat guard is left out: it is about one exact amount."); }
  if (cmd === "today") { const t = await P.todayView(); return console.log(flags.has("--json") ? JSON.stringify(t.data, null, 2) : t.lines.join("\n")); }

  if (cmd === "rule") {
    requireTTY("rule");
    const cfg = C.loadConfig();
    const [name, a1, a2] = pos;
    if (name === "max-fee") {
      if (a1 === "off") delete cfg.rules.maxFeeEth;
      else { if (!/^\d+(\.\d+)?$/.test(String(a1 || ""))) throw new Error("Usage: reinpay rule max-fee <eth|off>, e.g. 0.0001"); cfg.rules.maxFeeEth = a1; }
    } else if (name === "cosign") {
      const { isAddress, getAddress } = await import("viem");
      if (a1 === "off") delete cfg.rules.cosign;
      else {
        const [, , addr, tok, amt] = pos; const T = String(tok || "").toUpperCase();
        const { syncTokens } = await import("../src/chain.js");
        if (!isAddress(String(addr || "")) || !Object.keys(syncTokens(cfg)).includes(T) || !/^\d+(\.\d+)?$/.test(String(amt || ""))) throw new Error("Usage: reinpay rule cosign <0xaddress> <token> <amount> | off");
        if (getAddress(addr) === K.walletAddress()) throw new Error("The co-signer must be someone else, not this wallet.");
        cfg.rules.cosign = { by: getAddress(addr), above: { ...(cfg.rules.cosign?.above || {}), [T]: amt } };
      }
    } else if (name === "require-proven") {
      if (!["on", "off"].includes(a1)) throw new Error("Usage: reinpay rule require-proven <on|off>");
      if (a1 === "on") cfg.rules.requireProven = true; else delete cfg.rules.requireProven;
    } else if (name === "usd") {
      const k = { max: "max", daily: "daily" }[a1];
      if (!k || !(a2 === "off" || /^\d+(\.\d+)?$/.test(String(a2 || "")))) throw new Error("Usage: reinpay rule usd <max|daily> <amount|off>");
      const u = { ...(cfg.rules.usd || {}) };
      if (a2 === "off") delete u[k]; else u[k] = a2;
      if (Object.keys(u).length) cfg.rules.usd = u; else delete cfg.rules.usd;
    } else if (name === "memo-block") {
      const words = pos.slice(2).map((w) => String(w).trim().toLowerCase()).filter(Boolean), list = new Set(cfg.rules.memoBlock || []);
      if (a1 === "add") { if (!words.length) throw new Error("Usage: reinpay rule memo-block add <word> [word ...]"); for (const w of words) { if (w.length > 40) throw new Error("A blocked word or phrase can be at most 40 characters."); list.add(w); } }
      else if (a1 === "remove") { for (const w of words) list.delete(w); }
      else if (a1 === "off") list.clear();
      else throw new Error("Usage: reinpay rule memo-block <add|remove> <word ...> | off");
      if (list.size > 100) throw new Error("At most 100 blocked words.");
      if (list.size) cfg.rules.memoBlock = [...list]; else delete cfg.rules.memoBlock;
    } else if (name === "memo") {
      if (String(a1) === "off") delete cfg.rules.memoMin;
      else { const n = Number(a1); if (!(Number.isInteger(n) && n >= 1 && n <= 200)) throw new Error("Usage: reinpay rule memo <1-200|off>"); cfg.rules.memoMin = n; }
    } else if (name === "expire-after") {
      if (String(a1) === "off") delete cfg.rules.expireAfterMinutes;
      else { const ms = (await import("../src/rules.js")).parseDuration(a1); if (ms < 600_000) throw new Error("Use at least 10m."); cfg.rules.expireAfterMinutes = Math.round(ms / 60_000); }
    } else if (name === "hours") {
      if (String(a1) === "off") delete cfg.rules.hours;
      else cfg.rules.hours = { ...(await import("../src/rules.js")).parseHours(a1), ...(flags.has("--weekdays") ? { weekdays: true } : {}) };
    } else if (name === "balance-share") {
      if (String(a1) === "off") delete cfg.rules.balanceShare;
      else { const n = Number(a1); if (!(n >= 0.01 && n <= 100) || !/^\d+(\.\d{1,2})?$/.test(String(a1))) throw new Error("Usage: reinpay rule balance-share <0.01-100 percent|off>"); cfg.rules.balanceShare = n; }
    } else if (name === "per-day") {
      const n = Number(a1); if (!(Number.isInteger(n) && n >= 0 && n <= 10000)) throw new Error("Usage: reinpay rule per-day <0-10000> (0 turns it off)");
      if (n) cfg.rules.maxPerDay = n; else delete cfg.rules.maxPerDay;
    } else if (name === "per-hour") {
      const n = Number(a1); if (!(Number.isInteger(n) && n >= 0 && n <= 1000)) throw new Error("Usage: reinpay rule per-hour <0-1000> (0 turns it off)");
      if (n) cfg.rules.maxPerHour = n; else delete cfg.rules.maxPerHour;
    } else if (name === "category") {
      const [, cat, period, tok, amt] = pos;
      const { CATEGORY_RE } = await import("../src/rules.js");
      const { syncTokens } = await import("../src/chain.js");
      const T = String(tok || "").toUpperCase();
      if (!CATEGORY_RE.test(String(cat || "")) || period !== "daily" || !Object.keys(syncTokens(cfg)).includes(T) || !(amt === "off" || /^\d+(\.\d+)?$/.test(String(amt || "")))) throw new Error("Usage: reinpay rule category <name> daily <token> <amount|off>  (name: lowercase letters, digits, dashes)");
      const cats = { ...(cfg.rules.categories || {}) }, c = { daily: { ...(cats[cat]?.daily || {}) } };
      if (amt === "off") delete c.daily[T]; else c.daily[T] = amt;
      if (Object.keys(c.daily).length) cats[cat] = c; else delete cats[cat];
      if (Object.keys(cats).length) cfg.rules.categories = cats; else delete cfg.rules.categories;
    } else if (name === "first-payment") {
      if (!["ask", "off"].includes(String(a1))) throw new Error("Usage: reinpay rule first-payment <ask|off>");
      if (a1 === "ask") cfg.rules.firstPayment = "ask"; else delete cfg.rules.firstPayment;
    } else if (name === "breaker") {
      if (String(a1).toLowerCase() === "off") cfg.rules.breaker = "off";
      else {
        const n = Number(a1), m = Number(a2);
        if (!(Number.isInteger(n) && n >= 1 && n <= 100 && Number.isInteger(m) && m >= 1 && m <= 1440)) throw new Error("Usage: reinpay rule breaker <count 1-100> <minutes 1-1440> | off");
        cfg.rules.breaker = { count: n, minutes: m };
      }
    } else if (name === "repeat-guard") {
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
    if (sub === "check") {
      if (!name) throw new Error("Usage: reinpay payee check <0xaddress>");
      const v = await P.checkPayeeAddress(name);
      if (flags.has("--json")) return console.log(JSON.stringify(v, null, 2));
      console.log(`Checking ${v.address} on Robinhood Chain mainnet:`); for (const l of v.lines) console.log(l.startsWith("To add") || l === "" || /^(Looks|Be|Do)/.test(l) ? l : "  " + l);
      return console.log("Nothing was added or changed.");
    }
    if (sub === "export") {
      const { exportPayees } = await import("../src/payeeshare.js");
      const { writeFileSync: wf, existsSync: ex } = await import("node:fs");
      if (!K.isUnlocked()) requireTTY("payee export");
      const f = await exportPayees(C.loadConfig().payees, K.loadAccount(K.isUnlocked() ? undefined : await ask("Passphrase to sign the list (hidden): ", { hidden: true })));
      const out = opt("out") || "reinpay-payees.json";
      if (ex(out) && !flags.has("--force")) throw new Error(`${out} already exists. Use --out=<file> or --force.`);
      wf(out, JSON.stringify(f, null, 2) + "\n");
      return console.log(`Wrote ${out}: ${f.payees.length} payee${f.payees.length === 1 ? "" : "s"}, signed by ${f.by}.`);
    }
    requireTTY("payee " + sub);
    if (sub === "import") {
      const S = await import("../src/payeeshare.js");
      const { readFileSync: rf } = await import("node:fs");
      if (!name) throw new Error("Usage: reinpay payee import <file.json>");
      let f; try { f = JSON.parse(rf(name, "utf8")); } catch { throw new Error(`${name} is not a readable JSON file.`); }
      const sig = await S.checkPayeeFile(f);
      if (!sig.ok) throw new Error(`Not imported: ${sig.reason}.`);
      const mine = K.walletAddress();
      const plan = S.planImport(f, C.loadConfig().payees, mine);
      console.log(`Signed by ${sig.signer}${mine && sig.signer === mine ? " (this wallet)" : " (NOT this wallet: only go on if you trust who sent it)"} on ${f.at}.`);
      for (const p of plan.add) console.log(`  + ${p.name}  ${p.address}${p.tokens ? "  " + p.tokens.join(",") : ""}`);
      for (const x of plan.skip) console.log(`  - ${x.name}: ${x.why}`);
      if (!plan.add.length) { console.log("Nothing to add."); process.exit(0); }
      if ((await ask(`Add these ${plan.add.length} payee${plan.add.length === 1 ? "" : "s"}? Type yes: `)).trim().toLowerCase() !== "yes") { console.log("Nothing added."); process.exit(0); }
      let added = 0;
      for (const p of plan.add) {
        try { await P.addPayee({ name: p.name, address: p.address, tokens: p.tokens, note: p.note, maxPerPayment: p.maxPerPayment }); if (p.daily || p.expiresAt) P.setPayee(p.name, { ...(p.daily ? { daily: p.daily } : {}), ...(p.expiresAt ? { expiresAt: p.expiresAt } : {}) }); added++; }
        catch (e) { console.log(`  ! ${p.name}: ${e.message}`); }
      }
      return console.log(`Added ${added} of ${plan.add.length}.`);
    }
    if (sub === "add") {
      const tokens = opt("tokens") ? opt("tokens").toUpperCase().split(",") : undefined;
      let p;
      const untilMs = opt("until") ? (await import("../src/rules.js")).parseDuration(opt("until")) : null;
      if (!flags.has("--no-check")) { // v0.34's payee check runs first, so the owner sees what the address is before it is added
        const { addStep } = await import("../src/payeecheck.js");
        let v = null;
        try { v = await P.checkPayeeAddress(address); }
        catch (e) {
          if (/not a valid 0x address/.test(e.message)) throw e;
          console.log(`Could not check ${address} on Robinhood Chain (${e.message}).`);
          if ((await ask("Add it without the check? Type yes: ")).trim().toLowerCase() !== "yes") { console.log("Not added. Nothing changed."); process.exit(1); }
        }
        if (v) {
          console.log(`Checking ${v.address} before adding it as "${name}":`);
          for (const l of v.lines) if (!l.startsWith("To add")) console.log(l === "" || /^(Looks|Be|Do)/.test(l) ? l : "  " + l);
          const step = addStep(v, { yes: flags.has("--yes") });
          if (step === "stop") { console.log("Not added. Nothing changed."); process.exit(1); }
          if (step === "ask" && (await ask("Add it anyway? Type yes: ")).trim().toLowerCase() !== "yes") { console.log("Not added. Nothing changed."); process.exit(1); }
          if (step !== "lookalike") console.log("");
        }
      }
      try { p = await P.addPayee({ name, address, tokens, note: opt("note"), untilMs }); }
      catch (e) {
        if (e.code !== "LOOKALIKE") throw e;
        console.log(`\nCareful: ${e.message}\n\n  new:      ${address}\n  existing: ${e.like.address}  (${e.like.name})\n`);
        const typed = (await ask("If you checked it and it is right, type the new address again in full: ")).trim();
        if (typed.toLowerCase() !== String(address).toLowerCase()) { console.log("Not added. Nothing changed."); process.exit(1); }
        p = await P.addPayee({ name, address, tokens, note: opt("note"), allowLookalike: true, untilMs });
      }
      return console.log(`Added ${p.name} ${p.address}${p.expiresAt ? `, until ${p.expiresAt}` : ""}${p.isContract ? " (a contract, not a personal wallet: make sure it can receive tokens)" : ""}.`);
    }
    if (sub === "remove") return console.log(`Removed ${P.removePayee(name).name}.`);
    if (sub === "cooldown") { const p = P.setPayeeCooldown(name, address); return console.log(p.cooldownMinutes ? `${p.name}: at least ${p.cooldownMinutes} min between payments (sent or waiting).` : `${p.name}: no cooldown.`); }
    if (sub === "rename") { const r = P.renamePayee(name, address); return console.log(`Renamed ${r.from} to ${r.to} (${r.address})${r.schedules ? `, and ${r.schedules} schedule${r.schedules === 1 ? "" : "s"} that pay it` : ""}. Old receipts keep the name they were made with.`); }
    if (sub === "challenge") {
      const { proofMessage } = await import("../src/proof.js"); const { findPayee } = await import("../src/rules.js");
      const p = findPayee(C.loadConfig().payees, name); if (!p) throw new Error(`No payee "${name}".`);
      return console.log(`Send this text to ${p.name}. They sign it as a message with the wallet at ${p.address} (any wallet's "sign message" works) and send you the signature:\n\n${proofMessage(p, P.requireWallet())}\n\nThen: reinpay payee prove "${p.name}" 0x…`);
    }
    if (sub === "prove") {
      const { checkProof } = await import("../src/proof.js"); const { findPayee } = await import("../src/rules.js");
      const p = findPayee(C.loadConfig().payees, name); if (!p) throw new Error(`No payee "${name}".`);
      const r = await checkProof(p, P.requireWallet(), pos[2]);
      if (!r.ok) throw new Error(`Not recorded: ${r.reason}.`);
      P.setPayee(p.name, { proof: { sig: pos[2], at: new Date().toISOString() } });
      return console.log(`${p.name} proved it controls ${p.address} (${r.reason}).`);
    }
    if (sub === "category") {
      const cat = pos[2], { CATEGORY_RE } = await import("../src/rules.js");
      if (cat !== "off" && !CATEGORY_RE.test(String(cat || ""))) throw new Error("Usage: reinpay payee category <payee> <name|off>  (name: lowercase letters, digits, dashes)");
      const p = P.setPayee(name, { category: cat === "off" ? undefined : cat });
      return console.log(cat === "off" ? `${p.name} has no category.` : `${p.name} is in ${cat}.`);
    }
    if (sub === "until") {
      const ms = (await import("../src/rules.js")).parseDuration(pos[2]);
      const p = P.setPayee(name, { expiresAt: ms ? new Date(Date.now() + ms).toISOString() : undefined });
      return console.log(ms ? `${p.name} can be paid until ${p.expiresAt}.` : `${p.name} no longer expires.`);
    }
    if (sub === "off" || sub === "on") return console.log(`${P.setPayee(name, { disabled: sub === "off" }).name} is ${sub}.`);
    if (sub === "limit") {
      const [, , kind, tok, amount] = pos;
      const p = P.setPayeeLimit(name, kind, tok, amount);
      return console.log(`${p.name}: daily ${JSON.stringify(p.daily || {})}, max per payment ${JSON.stringify(p.maxPerPayment || {})}, asks you above ${JSON.stringify(p.approveAbove || {})}.`);
    }
    throw new Error("Usage: reinpay payee <add|list|remove|off|on|limit|until|category|challenge|prove|export|import>");
  }
  if (cmd === "pending") {
    P.expireStale(C.loadConfig().rules);
    const list = [...P.listReceipts({ status: "needs_approval", limit: 200 }), ...P.listReceipts({ status: "ready", limit: 200 })];
    return console.log(list.length ? list.map(line).join("\n") : "Nothing is waiting for you.");
  }
  if (cmd === "approve" && flags.has("--dry")) { // read-only: no TTY needed, nothing is signed
    const { listReceipts } = P;
    const ids = flags.has("--all") ? [...listReceipts({ status: "needs_approval", limit: 200 }), ...listReceipts({ status: "ready", limit: 200 })].map((r) => r.id).reverse() : [...new Set(pos.map((x) => x.toUpperCase()))];
    if (!ids.length) throw new Error(flags.has("--all") ? "Nothing is waiting for you." : "Usage: reinpay approve <RP-id> [RP-id ...] --dry");
    const res = []; for (const id of ids) res.push(await P.approvePreview(id));
    if (flags.has("--json")) return console.log(JSON.stringify(res, null, 2));
    for (const v of res) {
      console.log(`${v.id}  ${v.amount} ${v.token} to ${v.payee}: if you approved it now`);
      const w = Math.max(...v.steps.map((x) => x.rule.length));
      for (const x of v.steps) console.log(`  ${x.ok ? "✓" : "✗"} ${x.rule.padEnd(w)}  ${x.detail}`);
      console.log(v.wouldSign ? "  → it would be signed and sent.\n" : "  → it would not be sent.\n");
    }
    return console.log("Dry run: nothing was recorded, changed or signed. Approve for real with reinpay approve <id>.");
  }
  if (cmd === "approve") {
    requireTTY("approve");
    const { getReceipt, view } = await import("../src/receipts.js");
    P.expireStale(C.loadConfig().rules);
    const ids = flags.has("--all") ? [...P.listReceipts({ status: "needs_approval", limit: 200 }), ...P.listReceipts({ status: "ready", limit: 200 })].map((r) => r.id).reverse() : [...new Set(pos.map((x) => x.toUpperCase()))];
    if (!ids.length) throw new Error(flags.has("--all") ? "Nothing is waiting for you." : "Usage: reinpay approve <RP-id> [RP-id ...] | --all");
    for (const id of ids) { const r = getReceipt(id); if (!r) throw new Error(`No receipt ${id}.`); console.log(line(view(r))); }
    if ((await ask(`Approve and send ${ids.length === 1 ? "this payment" : `these ${ids.length} payments`}? Each is checked and simulated again first. Type yes: `)).trim().toLowerCase() !== "yes") return console.log("Not approved. Nothing was sent.");
    const pass = K.isUnlocked() ? undefined : await ask("Passphrase (hidden): ", { hidden: true });
    for (const id of ids) { try { console.log(line(await P.approve(id, { passphrase: pass, cosig: ids.length === 1 ? opt("cosig") : undefined }))); } catch (e) { console.log(`${id}: ${e.message}`); } }
    return;
  }
  if (cmd === "reject") { requireTTY("reject"); return console.log(line(P.reject(pos[0]))); }
  if (cmd === "notify") {
    requireTTY("notify");
    const { parseNotify, notifyOwner } = await import("../src/notify.js");
    const cfg = C.loadConfig();
    if (pos[0] === "memos") {
      if (!cfg.notify) throw new Error("Set up notifications first.");
      if (!["on", "off"].includes(pos[1])) throw new Error("Usage: reinpay notify memos <on|off>");
      cfg.notify = { ...cfg.notify }; if (pos[1] === "off") cfg.notify.hideMemos = true; else delete cfg.notify.hideMemos;
      C.saveConfig(cfg);
      return console.log(pos[1] === "off" ? "Notifications no longer include memos." : "Notifications include memos again.");
    }
    if (pos[0] === "log") {
      const L = (await import("../src/notify.js")).readLog().slice(-Number(opt("last") || 20));
      if (flags.has("--json")) return console.log(JSON.stringify(L, null, 2));
      return console.log(L.length ? L.map((x) => `${x.at}  ${x.ok ? "sent  " : "FAILED"}  ${x.event.padEnd(16)} ${x.receipt || ""}  ${x.type} ${x.host}  ${x.detail}${x.attempts > 1 ? ` (${x.attempts} tries)` : ""}`).join("\n") : "No notifications sent yet.");
    }
    if (pos[0] === "at") {
      if (!cfg.notify) throw new Error("Set up notifications first: reinpay notify telegram <bot-token> <chat-id>");
      const v = String(pos[1] || "").replace(/%$/, "");
      if (v === "off") { const { alertAt, ...rest } = cfg.notify; cfg.notify = rest; C.saveConfig(cfg); return console.log("Budget alerts off."); }
      const n = Number(v); if (!(Number.isInteger(n) && n >= 1 && n <= 100)) throw new Error("Usage: reinpay notify at <1-100|off>  e.g. reinpay notify at 80");
      cfg.notify = { ...cfg.notify, alertAt: n }; C.saveConfig(cfg);
      return console.log(`You will get one message a day per token when ${n}% of today's budget is used.`);
    }
    if (pos[0] === "secret") {
      if (cfg.notify?.type !== "webhook") throw new Error("Only webhooks are signed. Set one up first: reinpay notify webhook <https-url>");
      cfg.notify = { ...cfg.notify, secret: (await import("../src/notify.js")).newSecret() };
      C.saveConfig(cfg);
      return console.log(`New webhook signing secret (shown once; put it in your receiving server):\n${cfg.notify.secret}`);
    }
    if (pos[0] === "test") {
      if (!cfg.notify) throw new Error("Notifications are off. Set them up first: reinpay notify telegram <bot-token> <chat-id>");
      const n = await notifyOwner({ id: "RP-TEST", amount: "1", token: "USDG", payee: "Test", memo: "test message", rule: "test", reason: "This is a test from reinpay notify test.", status: "needs_approval" }, { cfg });
      return console.log(n.ok ? `Sent (${n.detail}).` : `Not sent: ${n.detail}`);
    }
    const n = parseNotify(pos[0], pos[1], pos[2]);
    if (n) cfg.notify = n; else delete cfg.notify;
    C.saveConfig(cfg);
    return console.log(n ? `Notifications on (${n.type}). Run reinpay notify test to check.${n.secret ? `\nWebhook signing secret (shown once; your server checks the x-reinpay-signature header with it):\n${n.secret}` : ""}` : "Notifications off.");
  }
  if (cmd === "report") {
    const { spendingReport, reportText } = await import("../src/report.js");
    const { allReceipts } = await import("../src/receipts.js");
    (await import("../src/chain.js")).syncTokens();
    const rep = spendingReport(allReceipts(), { days: opt("days") || 7 });
    if (flags.has("--csv")) return process.stdout.write((await import("../src/csv.js")).reportCSV(rep));
    if (flags.has("--html")) {
      const html = (await import("../src/htmlreport.js")).reportHTML(rep, { wallet: (await import("../src/keystore.js")).walletAddress() || "" });
      if (!opt("out")) return process.stdout.write(html);
      const { writeFileSync: wf } = await import("node:fs"); wf(opt("out"), html);
      return console.log(`Wrote ${opt("out")}. Open it in any browser; it loads nothing from the internet.`);
    }
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
  if (cmd === "verify") {
    const { verifyReceipt } = await import("../src/verify.js");
    const { allReceipts, getReceipt } = await import("../src/receipts.js");
    const list = flags.has("--all") ? allReceipts().filter((r) => r.txHash) : [getReceipt(pos[0] || "")];
    if (!flags.has("--all") && !list[0]) throw new Error(pos[0] ? `No receipt ${pos[0]}.` : "Usage: reinpay verify <RP-id> | --all");
    const res = [];
    for (const r of list) res.push(await verifyReceipt(r));
    if (flags.has("--json")) console.log(JSON.stringify(res, null, 2));
    else if (!res.length) console.log("No sent payments to check yet.");
    else for (const v of res) console.log(v.reason ? `- ${v.id}: ${v.reason}` : `${v.ok ? "✓" : "✕"} ${v.id} ${v.ok ? "matches the chain" : "does NOT match the chain"}  ${v.explorer}\n${v.checks.map((c) => `    ${c.ok ? "✓" : "✕"} ${c.name}: ${c.detail}`).join("\n")}`);
    if (res.some((v) => v.checks && !v.ok)) process.exitCode = 1;
    return;
  }
  if (cmd === "grant") {
    const [sub] = pos;
    const cfg = C.loadConfig();
    const now = Date.now();
    if (sub === "list" || !sub) return console.log(JSON.stringify((cfg.rules.grants || []).map((g) => ({ ...g, active: Date.parse(g.until) > now })), null, 2));
    requireTTY("grant");
    if (sub === "clear") { delete cfg.rules.grants; C.saveConfig(cfg); return console.log("All grants removed."); }
    const tok = String(sub).toUpperCase(), amount = pos[1];
    const { syncTokens } = await import("../src/chain.js");
    if (!Object.keys(syncTokens(cfg)).includes(tok) || !/^\d+(\.\d+)?$/.test(String(amount || ""))) throw new Error("Usage: reinpay grant <token> <amount> --for=2h [--note=...]");
    const ms = (await import("../src/rules.js")).parseDuration(opt("for") || "");
    if (!ms || ms > 30 * 86_400_000) throw new Error("--for is required, up to 30d (e.g. --for=2h).");
    const g = { token: tok, amount: String(amount), until: new Date(now + ms).toISOString(), ...(opt("note") ? { note: opt("note").slice(0, 100) } : {}) };
    cfg.rules.grants = [...(cfg.rules.grants || []).filter((x) => Date.parse(x.until) > now), g];
    C.saveConfig(cfg);
    return console.log(`Granted ${g.amount} ${tok} on top of the daily budget until ${g.until}.`);
  }
  if (cmd === "check") {
    const [payee, amount, token] = pos;
    if (opt("plan")) {
      const { readFileSync: rf } = await import("node:fs");
      let items; try { items = JSON.parse(rf(opt("plan"), "utf8")); } catch { throw new Error(`${opt("plan")} is not a readable JSON file.`); }
      const pl = await P.previewPlan(items);
      if (flags.has("--json")) return console.log(JSON.stringify(pl, null, 2));
      const W = { ready: "READY", needs_approval: "WAITS", blocked: "BLOCKED" };
      console.log(`Plan of ${pl.payments.length} payments, checked in order as if all were asked for now:`);
      const pw = Math.max(...pl.payments.map((r) => r.payee.length)), aw = Math.max(...pl.payments.map((r) => `${r.amount} ${r.token}`.length));
      for (const r of pl.payments) console.log(`  ${String(r.n).padStart(2)}. ${`${r.amount} ${r.token}`.padEnd(aw)}  ${r.payee.padEnd(pw)}  ${W[r.wouldBe].padEnd(8)} ${r.rule}${r.wouldBe === "ready" ? "" : `: ${r.reason}`}${r.simulation?.block ? `  (simulated, block ${r.simulation.block})` : ""}`);
      const s = pl.summary, through = Object.values(s.wouldGoThrough).join(", ") || "nothing";
      return console.log(`\n${s.ready} ready, ${s.needsApproval} would wait for you, ${s.blocked} blocked. Would go through: ${through}.\nEach simulated from today's balance, one at a time. Nothing was recorded or signed.`);
    }
    if (!payee || !amount) throw new Error("Usage: reinpay check <payee> <amount> [token] [--explain]");
    const v = await P.previewPayment({ payee, amount, token: token || "USDG", explain: flags.has("--explain") });
    if (v.steps && !flags.has("--json")) { const { explainLines } = await import("../src/explain.js"); console.log(`Every rule, in order, for ${v.amount} ${v.token} to ${v.payee}:`); for (const l of explainLines(v.steps)) console.log(l); console.log(""); }
    return console.log(flags.has("--json") ? JSON.stringify(v, null, 2) : `Dry run: ${v.amount} ${v.token} to ${v.payee} would be ${v.wouldBe.toUpperCase()} (${v.rule}). ${v.reason}${v.simulation ? `\nSimulated on mainnet at block ${v.simulation.block}${v.simulation.estimatedFeeEth ? `, fee about ${v.simulation.estimatedFeeEth} ETH` : ""}.` : ""}\nNothing was recorded or signed.`);
  }
  if (cmd === "backup") {
    const { makeBackup } = await import("../src/backup.js");
    const { writeFileSync: wf, existsSync: ex } = await import("node:fs");
    const b = makeBackup();
    const out = opt("out") || `reinpay-backup-${b.address.slice(2, 8).toLowerCase()}-${b.createdAt.slice(0, 10)}.json`;
    if (ex(out) && !flags.has("--force")) throw new Error(`${out} already exists. Use --out=<file> or --force.`);
    wf(out, JSON.stringify(b, null, 1) + "\n", { mode: 0o600 });
    return console.log(`Wrote ${out} for ${b.address}. The key inside is still encrypted with your passphrase; keep the file somewhere safe anyway, and do not share it.`);
  }
  if (cmd === "restore") {
    requireTTY("restore");
    const { restoreBackup } = await import("../src/backup.js");
    const { readFileSync: rf } = await import("node:fs");
    if (!pos[0]) throw new Error("Usage: reinpay restore <file.json>");
    let b; try { b = JSON.parse(rf(pos[0], "utf8")); } catch { throw new Error(`${pos[0]} is not a readable JSON file.`); }
    const r = await restoreBackup(b);
    return console.log(`Restored ${r.address} with ${r.receipts} receipts${r.frozen ? " (still frozen)" : ""}. Config seal: ${r.seal.ok ? "ok" : r.seal.reason}.\nYour passphrase is the same as before. Run reinpay doctor to check the setup.`);
  }
  if (cmd === "schedule") {
    const S = await import("../src/schedule.js");
    const [sub, a1, a2, a3, a4] = pos;
    const cfg = C.loadConfig();
    if (sub === "list" || !sub) { const st = S.loadState(); return console.log(JSON.stringify((cfg.schedules || []).map((x) => ({ ...x, next: S.nextOf(x, st) })), null, 2)); }
    if (sub === "run") {
      const { checkSeal } = await import("../src/seal.js");
      const st = S.loadState(), list = S.due(cfg.schedules, st);
      if (!list.length) return console.log("Nothing is due.");
      const sc = await checkSeal(cfg, K.walletAddress());
      if (!sc.ok) throw new Error(`Not run: ${sc.reason}. Check reinpay rules, then reinpay seal.`);
      const now = Date.now();
      for (const x of list) {
        const { next, skipped } = S.advance(x, st, now); S.saveState(st); // advance first: a crash never pays one slot twice
        const r = await P.requestPayment({ payee: x.payee, amount: x.amount, token: x.token, memo: `${x.id} ${x.every}${x.memo ? ": " + x.memo : ""}` }, { by: "schedule" });
        console.log(`${x.id} ${x.amount} ${x.token} to ${x.payee}: ${r.status} (${r.rule})${skipped ? `, ${skipped} missed slot${skipped === 1 ? "" : "s"} skipped` : ""}. ${r.id}. Next: ${next}`);
      }
      return;
    }
    requireTTY("schedule " + sub);
    if (sub === "add") {
      const { syncTokens } = await import("../src/chain.js"); const { findPayee } = await import("../src/rules.js");
      const p = findPayee(cfg.payees, a1); if (!p) throw new Error(`"${a1}" is not on your payee list.`);
      const tok = String(a3 || "").toUpperCase(); if (!Object.keys(syncTokens(cfg)).includes(tok)) throw new Error(`Unknown token "${a3}".`);
      const x = S.newSchedule({ payee: p.name, amount: a2, token: tok, every: a4, start: opt("start"), memo: opt("memo") });
      cfg.schedules = [...(cfg.schedules || []), x]; C.saveConfig(cfg);
      return console.log(`Added ${x.id}: ${x.amount} ${tok} to ${p.name} ${x.every}, first at ${x.start}. Every one still goes through your rules.\nRun reinpay schedule run from cron, e.g. every 15 minutes.`);
    }
    const x = (cfg.schedules || []).find((s) => s.id === String(a1 || "").toUpperCase());
    if (!x) throw new Error(`No schedule ${a1}. See reinpay schedule list.`);
    if (sub === "remove") cfg.schedules = cfg.schedules.filter((s) => s !== x);
    else if (sub === "pause") x.paused = true;
    else if (sub === "resume") delete x.paused;
    else throw new Error("Usage: reinpay schedule <add|list|remove|pause|resume|run>");
    C.saveConfig(cfg);
    return console.log(`${x.id} ${sub === "remove" ? "removed" : sub + "d"}.`);
  }
  if (cmd === "pay") {
    const { readLink } = await import("../src/paylink.js");
    const L = readLink(pos[0], C.loadConfig());
    console.log(`Link: ${L.amount} ${L.token || "?"} to ${L.payee || L.to}${L.payee ? ` (${L.to})` : ""}`);
    if (L.problem) throw new Error(`Not paid: ${L.problem}.`);
    const r = await P.requestPayment({ payee: L.payee, amount: L.amount, token: L.token, memo: opt("memo") || "payment link" }, { by: "owner" });
    return console.log(line(r));
  }
  if (cmd === "link") {
    const { makeLink } = await import("../src/paylink.js"); const { findPayee, parseAmount } = await import("../src/rules.js"); const { syncTokens } = await import("../src/chain.js");
    const cfg = C.loadConfig(); syncTokens(cfg);
    const p = findPayee(cfg.payees, pos[0]); if (!p) throw new Error(`"${pos[0]}" is not on your payee list.`);
    const tok = String(pos[2] || "USDG").toUpperCase();
    return console.log(makeLink(p.address, tok, parseAmount(pos[1], tok)));
  }
  if (cmd === "price") {
    const { ethPrice } = await import("../src/price.js");
    const p = await ethPrice();
    console.log(p.pools.map((x) => `  pool ${x.pool}: ${x.price ?? "no answer"}`).join("\n"));
    return console.log(p.price === null ? `No price: ${p.reason}. Payments that need one are blocked while USD rules are on.` : `ETH = ${p.price.toFixed(2)} USDG (average of two pools, ${((Math.abs(p.pools[0].price - p.pools[1].price) / Math.min(p.pools[0].price, p.pools[1].price)) * 100).toFixed(3)}% apart; refused above 2%).`);
  }
  if (cmd === "share") {
    const S = await import("../src/statement.js");
    if (pos[0] !== "check") {
      const { getReceipt } = await import("../src/receipts.js");
      const { writeFileSync: wf, existsSync: ex } = await import("node:fs");
      const st = S.receiptProof(getReceipt(pos[0] || ""), { wallet: P.requireWallet(), memos: !flags.has("--no-memos") });
      if (!K.isUnlocked()) requireTTY("share");
      const signed = await S.signStatement(st, K.loadAccount(K.isUnlocked() ? undefined : await ask("Passphrase to sign the receipt (hidden): ", { hidden: true })));
      const out = opt("out") || `reinpay-receipt-${st.payments[0].id}.json`;
      if (ex(out) && !flags.has("--force")) throw new Error(`${out} already exists. Use --out=<file> or --force.`);
      wf(out, JSON.stringify(signed, null, 2) + "\n");
      return console.log(`Wrote ${out}: ${st.payments[0].amount} ${st.payments[0].token} to ${st.payments[0].payee}, tx ${st.payments[0].txHash}, signed by ${signed.signature.by}.\nWhoever gets it can check it with: reinpay share check ${out}`);
    }
  }
  if (cmd === "redact") {
    requireTTY("redact");
    const { redactMemo, getReceipt, view } = await import("../src/receipts.js");
    const r = getReceipt(pos[0] || ""); if (!r) throw new Error(`No receipt ${pos[0]}.`);
    console.log(`${r.id} memo: "${r.memo}"`);
    if ((await ask("Remove this memo for good? Type yes: ")).trim().toLowerCase() !== "yes") return console.log("Kept.");
    return console.log(line(view(redactMemo(r.id, opt("reason")))));
  }
  if (cmd === "cosign-message") {
    const { getReceipt } = await import("../src/receipts.js"); const { cosignMessage } = await import("../src/cosign.js");
    const r = getReceipt(pos[0] || ""); if (!r) throw new Error(`No receipt ${pos[0]}.`);
    return console.log(`Send this text to the co-signer. They sign it as a message and send you the signature:\n\n${cosignMessage(r)}\n\nThen: reinpay approve ${r.id} --cosig=0x…`);
  }
  if (cmd === "statement" || (cmd === "share" && pos[0] === "check")) {
    const S = await import("../src/statement.js");
    const { readFileSync: rf, writeFileSync: wf, existsSync: ex } = await import("node:fs");
    if (pos[0] === "check") {
      if (!pos[1]) throw new Error("Usage: reinpay statement check <file.json>");
      let st; try { st = JSON.parse(rf(pos[1], "utf8")); } catch { throw new Error(`${pos[1]} is not a readable JSON file.`); }
      const res = await S.checkStatement(st);
      console.log(flags.has("--json") ? JSON.stringify(res, null, 2) : S.statementCheckText(st, res));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    const { allReceipts } = await import("../src/receipts.js");
    const st = S.buildStatement(allReceipts(), { wallet: P.requireWallet(), days: opt("days") || 30, memos: !flags.has("--no-memos") });
    if (!K.isUnlocked()) requireTTY("statement");
    const signed = await S.signStatement(st, K.loadAccount(K.isUnlocked() ? undefined : await ask("Passphrase to sign the statement (hidden): ", { hidden: true })));
    const out = opt("out") || `reinpay-statement-${st.from}-to-${st.to}.json`;
    if (ex(out) && !flags.has("--force")) throw new Error(`${out} already exists. Use --out=<file> or --force.`);
    wf(out, JSON.stringify(signed, null, 2) + "\n");
    return console.log(`Wrote ${out}: ${st.count} sent payment${st.count === 1 ? "" : "s"} from ${st.from} to ${st.to}, totals ${JSON.stringify(st.totals)}, signed by ${signed.signature.by}.\nAnyone can check it with: reinpay statement check ${out}`);
  }
  if (cmd === "digest") {
    const { currentDigest } = await import("../src/digest.js");
    const { allReceipts } = await import("../src/receipts.js");
    (await import("../src/chain.js")).syncTokens();
    let text = currentDigest(allReceipts(), { days: opt("days") || 1 });
    if (flags.has("--all")) {
      const FL = await import("../src/fleet.js");
      const parts = await FL.eachProfile(async () => { const RC2 = await import("../src/receipts.js"), K2 = await import("../src/keystore.js"); return K2.walletAddress() ? { t: currentDigest(RC2.allReceipts(), { days: opt("days") || 1 }) } : {}; });
      text = parts.filter((x) => x.t).map((x) => `[${x.profile}] ${x.t}`).join("\n\n");
    }
    if (flags.has("--dry")) return console.log(text);
    const cfg = C.loadConfig();
    if (!cfg.notify) throw new Error("Notifications are off, so there is nowhere to send the digest. Set them up with reinpay notify, or use --dry to print it.");
    const { notifyOwner } = await import("../src/notify.js");
    const n = await notifyOwner({ id: "DIGEST", status: "digest" }, { cfg, text, event: "digest" });
    console.log(n.ok ? `Digest sent (${n.detail}).` : `Digest not sent: ${n.detail}`);
    if (!n.ok) process.exitCode = 1;
    return;
  }
  if (cmd === "books") {
    if (!opt("month")) throw new Error("Usage: reinpay books --month=2026-11 [--csv | --json]");
    const { monthRows, BOOK_COLS } = await import("../src/books.js");
    const { allReceipts } = await import("../src/receipts.js");
    const m = monthRows(allReceipts(), opt("month"), { memos: !flags.has("--no-memos") });
    if (flags.has("--csv")) return process.stdout.write((await import("../src/csv.js")).toCSV(m.rows, BOOK_COLS));
    if (flags.has("--json")) return console.log(JSON.stringify(m, null, 2));
    return console.log(`${m.month}: ${m.count} sent payment${m.count === 1 ? "" : "s"} · ${Object.entries(m.totals).map(([t, v]) => `${v} ${t}`).join(", ") || "nothing"} · about ${m.usdTotal} USD${m.usdMissing ? ` (${m.usdMissing} without a USD value)` : ""}\nAdd --csv for a spreadsheet: reinpay books --month=${m.month} --csv > reinpay-${m.month}.csv`);
  }
  if (cmd === "review") {
    const { review, reviewText } = await import("../src/review.js");
    const { allReceipts } = await import("../src/receipts.js");
    const cfg = C.loadConfig(); (await import("../src/chain.js")).syncTokens(cfg);
    const list = review(cfg, allReceipts(), { days: Number(opt("days")) || 30 });
    return console.log(flags.has("--json") ? JSON.stringify(list, null, 2) : reviewText(list));
  }
  if (cmd === "doctor") {
    const { doctor, doctorText } = await import("../src/doctor.js");
    const checks = await doctor();
    console.log(flags.has("--json") ? JSON.stringify(checks, null, 2) : doctorText(checks));
    if (checks.some((c) => c.level === "fail")) process.exitCode = 1;
    return;
  }
  if (cmd === "receipts") {
    const fo = { status: opt("status"), payee: opt("payee"), token: opt("token"), since: opt("since"), until: opt("until"), memo: opt("memo"), rule: opt("rule"), session: opt("session"), min: opt("min"), max: opt("max") };
    const list = P.listReceipts({ ...fo, limit: 200 });
    if (flags.has("--csv")) {
      const { toCSV, RECEIPT_COLS } = await import("../src/csv.js");
      const { allReceipts, view } = await import("../src/receipts.js");
      const { search } = await import("../src/search.js"); (await import("../src/chain.js")).syncTokens();
      const all = search(allReceipts(), fo).map(view); // every matching receipt, oldest first
      return process.stdout.write(toCSV(all, RECEIPT_COLS));
    }
    return console.log(flags.has("--json") ? JSON.stringify(list, null, 2) : list.length ? list.map(line).join("\n") : "No receipts yet.");
  }
  console.error(`Unknown command "${cmd}".\n\n${HELP}`);
  process.exit(1);
}

// Commands that change rules, payees, tokens or notifications seal the config with the wallet key afterwards.
const MUTATING = ["rule", "autosend"].includes(cmd) || (cmd === "rules" && pos[0] === "import") || (cmd === "notify" && pos[0] === "memos") || (cmd === "schedule" && ["add", "remove", "pause", "resume"].includes(pos[0])) || (cmd === "grant" && pos[0] && pos[0] !== "list") || (cmd === "notify" && pos[0] !== "test") || (cmd === "payee" && ["add", "remove", "rename", "cooldown", "off", "on", "limit", "until", "import", "category", "prove"].includes(pos[0])) || (cmd === "token" && ["add", "remove"].includes(pos[0]));
async function reseal(passphrase) {
  const K = await import("../src/keystore.js"), C = await import("../src/config.js"), { sealConfig } = await import("../src/seal.js");
  const pass = passphrase ?? (K.isUnlocked() ? undefined : await ask("Passphrase to seal your rules (hidden): ", { hidden: true }));
  const account = K.loadAccount(pass);
  const sealed = await sealConfig(C.loadConfig(), account);
  C.saveConfig(sealed);
  const e = await (await import("../src/history.js")).recordSeal(sealed, account); // v0.36: one signed entry per change
  console.log(`Rules sealed with your wallet key (${sealed.seal.at}).${e ? ` History: ${e.changes.length} change${e.changes.length === 1 ? "" : "s"} recorded.` : ""}`);
}
main().then(() => (MUTATING ? reseal() : null)).catch((e) => { console.error(e?.shortMessage || e?.message || e); process.exit(1); });
