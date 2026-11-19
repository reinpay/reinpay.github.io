# Reinpay

> **Official $REINPAY contract:** `0x17c4735E9da7F1eeB76d1cC17C2f196F38DE64b3` (Robinhood Chain mainnet). The same address is on [reinpay.app](https://reinpay.app) and pinned on [@Reinpayapp](https://x.com/Reinpayapp). Any other address using the Reinpay name is not ours. [Details](#official-token)

A wallet for AI agents that only spends inside your rules.

Your agent can read its budget and ask for payments. You decide the rules: a daily budget per token, a max per payment, the payees it may pay, and the amount above which it has to ask you. Every payment is simulated on **Robinhood Chain mainnet** (chain id 4663) before anything is signed, and every request gets a receipt that names the rule that decided it.

Version 0.5.0. USDG and ETH built in; add other verified ERC-20s. Works with any MCP host that runs a local command (Claude Code, Cursor, Codex, Windsurf, VS Code and others).

## How a payment works

1. The agent calls `get_rules`, then `request_payment` with a payee from your list, an amount and a memo.
2. Reinpay checks the rules, in this order:
   - the payee is on your list and switched on, and may be paid in that token;
   - the amount is above zero and not above the max per payment (yours, and the payee's own if set);
   - today's budget for that token still has room, counting payments already sent **and** payments still waiting for you;
   - if you set them, this week's and this month's budgets still have room (weeks start on Monday);
   - if you set one, the payee's own daily budget still has room, counted the same way;
   - the same payee, token and amount was not asked for within the repeat guard (default 10 minutes); if it was, it waits for you;
   - the amount is not above your approval line; if it is, it waits for you.
3. The payment is simulated on mainnet with `eth_simulateV1`. The simulation must show exactly one thing leaving the wallet: that amount of that token, to that payee. The wallet must also hold enough ETH for the network fee.
4. What happens next:
   - **blocked**: nothing is signed. The receipt says which rule and why.
   - **needs_approval**: waits for you.
   - **ready**: inside every rule, and waits for you because `autosend` is off (the default) or the wallet is locked.
   - **sending / sent**: only when you turned `autosend` on and ran `reinpay unlock`.
5. `reinpay approve <id>` checks the budget again, simulates again, asks you to type `yes`, then signs and sends.

The agent cannot approve its own requests, change rules, or add payees. Those commands exist only in your terminal and refuse to run without one.

## Install

Node.js 22.12.0 or newer.

```sh
npm install -g https://github.com/reinpay/reinpay/archive/refs/heads/main.tar.gz
reinpay --version
```

## Set up (in your own terminal)

```sh
reinpay init                      # new wallet (or: reinpay init --import)
reinpay payee add "Weather API" 0xRecipientAddress --tokens=USDG --note="data bundles"
reinpay rule daily USDG 25        # daily budget
reinpay rule max USDG 10          # max per payment
reinpay rule approve-above USDG 5 # above this, it asks you
reinpay payee limit "Weather API" daily USDG 10   # optional: this payee's own daily cap
reinpay rule weekly USDG 100      # optional: weekly and monthly budgets too
reinpay notify telegram <bot-token> <chat-id>    # optional: a message when a payment waits for you
reinpay rules                     # check everything
reinpay address                   # fund this address with a small amount only
```

Then add the MCP server to your agent host. For Claude Code:

```sh
claude mcp add --scope user reinpay -- reinpay mcp
```

Any other host: run `reinpay mcp` as a stdio server.

## Day to day

```sh
reinpay pending                   # what is waiting for you
reinpay approve RP-00012          # re-check, re-simulate, type yes, send
reinpay reject RP-00013
reinpay receipts                  # everything, newest first (--json, or --csv for a spreadsheet)
reinpay report                    # last 7 days: sent, waiting, blocked, top payees (--days=30, --json)
reinpay autosend on               # optional: send payments inside every rule without asking
reinpay unlock --for=2h           # needed for autosend; expires on its own (reinpay lock ends it now)
reinpay seal                      # after updating to 0.5.0, or if config.json was changed by hand
```

## Tools for the agent

| Tool | What it does |
| --- | --- |
| `wallet_status` | Address, ETH and USDG balances, today's budget left per token, the rules |
| `get_rules` | The rules and the payees the agent may pay |
| `request_payment` | Ask for one payment; returns the decision and the receipt |
| `get_receipt` | One receipt by id |
| `list_receipts` | Recent receipts, optionally by status |

## One wallet per agent

Give each agent its own wallet, with its own key, rules, payees and receipts:

```sh
reinpay init --profile=research
reinpay payee add "Search API" 0xRecipient --tokens=USDG --profile=research
reinpay rule daily USDG 10 --profile=research
claude mcp add --scope user reinpay-research -- reinpay mcp --profile=research
reinpay profiles                  # list every wallet on this computer
```

Without `--profile` you use the default wallet in `~/.reinpay`. Profiles live in `~/.reinpay/profiles/<name>`.

## Other tokens

```sh
reinpay token add 0xTokenAddress  # checked on-chain and on Sourcify first
reinpay rule daily SYMBOL 100     # nothing can be spent until you set this
reinpay token list
reinpay token remove SYMBOL
```

A token is refused if it has no code, does not answer like an ERC-20, clashes with a symbol Reinpay already knows, or is not verified on Sourcify.

## Notifications

Payments above your approval line wait for you. To hear about them without watching the terminal:

```sh
reinpay notify telegram <bot-token> <chat-id>   # a bot you made with @BotFather; send it /start first
reinpay notify webhook https://example.com/hook # or a JSON POST to your own https endpoint
reinpay notify test                             # sends a test message
reinpay notify off
```

The message has the receipt id, the amount, the payee, the rule that held it and the approve command. Nothing is approved from the message: approving stays in your terminal.

## Security model

Reinpay is built for agents that reach the wallet **only through its MCP tools**. Over MCP an agent can read and ask; it cannot approve, change rules, add payees or read the key.

What Reinpay does not protect against: an agent that can run **arbitrary shell commands as your own user**. Such an agent can read anything you can read, including `~/.reinpay`. In particular:

- while the wallet is unlocked, the passphrase sits in `~/.reinpay/passphrase`, so the keystore plus that file give the key;
- `config.json` can be edited directly. Since 0.5.0 every change you make in the terminal is sealed with the wallet key, and nothing is signed while the seal does not match; but while the wallet is unlocked, an agent that can read the passphrase file could reseal it too;
- the terminal-only commands check for a real terminal (TTY), and a tool that fakes one can get past that check.

So, if your agent has shell access:

- run the agent as a **different OS user** that cannot read your `~/.reinpay`, or in a container without your home folder;
- keep the wallet **locked** (`reinpay lock`) and `autosend` **off**, which is the default; then every payment needs you to type your passphrase. If you unlock, do it for a short time: `reinpay unlock --for=30m`;
- fund the wallet with only what you are willing to lose.

Approvals never sign data read back from disk: `reinpay approve` rebuilds the transaction from the payee list and the amount, simulates it, and signs that same transaction.

## Where things are kept

Everything is in `~/.reinpay` (or `$REINPAY_HOME`), readable by you only:

- `keystore.json`: the key, encrypted with scrypt and AES-256-GCM.
- `passphrase`: only while unlocked.
- `config.json`: rules, payees and notification settings (a Telegram bot token, if you set one).
- `receipts.json`: every request and what happened to it.

Nothing is sent anywhere except to the Robinhood Chain RPC (`https://rpc.mainnet.chain.robinhood.com`, or `REINPAY_RPC`).

## Defaults

| Rule | USDG | ETH |
| --- | --- | --- |
| Daily budget | 25 | 0.005 |
| Max per payment | 10 | 0.002 |
| Asks you above | 5 | 0.001 |

The repeat guard is 10 minutes, and `autosend` is off. A token with no daily budget cannot be spent. There are no payees until you add one.

## Limits of this version

- USDG (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`) and ETH are built in. Other ERC-20s can be added if they are verified on Sourcify; Reinpay cannot judge whether a token is worth anything.
- Budgets are per token. There is no conversion between tokens.
- Profiles separate wallets on one computer; they do not share budgets.
- Deciding a payment takes a lock in `~/.reinpay/spend.lock`, so requests are decided one at a time, even across several MCP servers. A request waits up to 30 seconds for another one to finish.
- The simulation checks what leaves the wallet. It cannot check that a payee delivers what you paid for.

## Tests

```sh
npm test
```

`test/rules.test.mjs` checks every rule offline, `test/lock.test.mjs` the spend lock (including two processes), `test/report.test.mjs` the spending report, `test/notify.test.mjs` the owner notifications, `test/csv.test.mjs` the CSV export and `test/profile.test.mjs` the profiles. `test/live.mjs` runs on mainnet:

- USDG transfer simulations from a public holder, and tampered ones that must be refused;
- the full flow with a throwaway wallet that has a pretend ETH balance only inside the simulation;
- two requests at the same moment against one budget, and a payee's own daily budget;
- a token contract refused as a payee, weekly budgets, and a notification attempt logged on the receipt;
- a Sourcify-verified token added and spent only after its budget is set, and an unverified one refused;
- the MCP server over stdio.

Nothing is signed or sent.

## Official token

| | |
| --- | --- |
| Name | Reinpay (`REINPAY`) |
| Contract | `0x17c4735E9da7F1eeB76d1cC17C2f196F38DE64b3` |
| Chain | Robinhood Chain mainnet, chain id 4663 |
| Standard | ERC-20, 18 decimals, 1,000,000,000 supply |
| Launched on | [Pons V2](https://ponsfamily.com/launchpad/0x17c4735e9da7f1eeb76d1cc17c2f196f38de64b3) |
| Explorer | [Blockscout](https://robinhoodchain.blockscout.com/token/0x17c4735E9da7F1eeB76d1cC17C2f196F38DE64b3) |

This is the only official contract. It is also listed on [reinpay.app](https://reinpay.app) and [@Reinpayapp](https://x.com/Reinpayapp). Any other address using the Reinpay name is not ours. The wallet itself does not need the token: it pays in USDG and ETH.

## Licence

MIT. Nothing here is financial advice.
