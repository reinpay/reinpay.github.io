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
reinpay verify RP-00012           # read a sent payment back from the chain and check it (--all for every one)
reinpay doctor                    # check the whole setup: Node, RPC, chain, wallet, seal, unlock, gas money, brakes, payees, budgets
reinpay freeze "checking a bill"  # stop every payment now; reinpay unfreeze starts again
reinpay payee add "Trial API" 0xAddress --until=30d   # a payee that expires on its own
reinpay rule first-payment ask    # the first payment to every payee waits for you
reinpay statement --days=30       # a spending statement signed with your wallet key
reinpay statement check file.json # check anyone's statement against the chain
reinpay digest                    # a short summary to your Telegram or webhook (put it on a daily schedule)
reinpay check "Weather API" 3     # dry run: what would happen now (nothing recorded or signed)
reinpay grant USDG 20 --for=2h    # extra budget for one task, gone when the time is up
reinpay backup                    # move this wallet: key (still encrypted), rules, payees, receipts
reinpay payee export              # your payee list, signed, to share with a teammate or another profile
reinpay payee import list.json    # add payees from a signed list, after the usual checks
reinpay payee category "GPU credits" compute      # group payees
reinpay rule category compute daily USDG 10       # a daily budget for the whole group
reinpay rule hours 9-18 --weekdays                # outside these hours, everything waits for you
reinpay rule per-hour 10                          # at most 10 payments in any hour
reinpay schedule add "Weather API" 5 USDG weekly  # a payment that comes back every week
reinpay pay "ethereum:0x…"                        # ask for a payment from a payment link
reinpay notify at 80                              # a message when 80% of today's budget is used
reinpay approve RP-00012 RP-00013                 # several at once, one yes (or --all)
reinpay rule memo 10                              # the agent must say what a payment is for
reinpay rule expire-after 24h                     # unanswered requests expire and free the budget
reinpay profiles --status                         # every agent's wallet on one screen
reinpay freeze --all "checking"                   # stop every agent at once
reinpay rule usd max 20                           # no single payment above 20 dollars, in USDG or ETH
reinpay rule usd daily 50                         # 50 dollars a day across USDG and ETH together
reinpay price                                     # the ETH price those rules use right now
```

### Limits in dollars

Budgets per token cannot say "at most 20 dollars, whatever the token". `reinpay rule usd max <amount>` and `reinpay rule usd daily <amount>` can. USDG counts one to one. ETH is priced from two WETH/USDG pools on Robinhood Chain (`slot0` of each); if a pool does not answer, is not WETH/USDG, or the two prices are more than 2% apart, there is no price and an ETH payment is blocked (rule `usd price`), never guessed. While USD rules are on, payments in other tokens are blocked too, since they have no price. Receipts keep `usdValue` and `ethPriceUsdg`, so the daily dollar budget adds up what was really used. `reinpay price` shows both pools and the price in use. Both rules are off until you set them; `off` removes one.

### Many agents

When each agent has its own wallet (`--profile=<name>`), `reinpay profiles --status` shows them all: address, locked or unlocked, autosend, frozen, today's spend against the budget, payments waiting for you and requests blocked today. It reads local files only. `reinpay freeze --all [reason]` freezes every wallet; `reinpay unfreeze --all` (terminal only) lists the frozen ones and unfreezes them after one yes. `reinpay digest --all` sends one summary covering every wallet, through the default profile's notifications.

### Approvals

- `reinpay approve <RP-id> [RP-id ...]` or `reinpay approve --all` shows every payment, asks once, and then approves them one by one. Each is checked against the rules and simulated again, exactly as a single approval.
- `reinpay rule expire-after 24h` (or `90m`, at least `10m`; `off`): a payment that waits longer than that for you becomes `expired`. It no longer holds today's budget and cannot be approved; the agent can ask again.
- `reinpay rule memo 10` (`off`): requests whose memo has fewer characters are blocked (rule `memo`), so every receipt says what it was for. `check_payment` takes the memo too.

### Bills

- **Scheduled payments.** `reinpay schedule add <payee> <amount> <token> <daily|weekly|monthly> [--start=2026-12-01T09:00] [--memo=...]`, then run `reinpay schedule run` from cron or Task Scheduler (for example every 15 minutes: `*/15 * * * * reinpay schedule run`). Each due payment is asked for exactly like the agent would: every rule, the mainnet simulation, a receipt. It is sent only if autosend is on and the wallet is unlocked; otherwise it waits for you. Missed slots are skipped, never paid as a backlog. What to pay is part of the sealed config; when it runs next is kept in `schedules-state.json`, so running schedules never breaks the seal. `schedule list | pause | resume | remove`.
- **Payment links.** `reinpay pay <ethereum:… link>` reads a standard EIP-681 link (ETH, or an ERC-20 `transfer`) and asks for that payment, but only if the recipient is already on your payee list and the link is for Robinhood Chain (or names no chain). `reinpay link <payee> <amount> [token]` makes one. Agents get the read-only `read_payment_link` tool, which says who and how much without paying.
- **Budget alerts.** `reinpay notify at 80` sends one Telegram or webhook message a day per token once that share of today's budget is sent or waiting (event `budget_alert`). `reinpay notify at off` stops it.

### Smarter rules

All three are off until you set them.

- **Category budgets.** Put payees in a category with `reinpay payee category <payee> <name>` and give the category its own daily budget with `reinpay rule category <name> daily <token> <amount>`. A payment must fit both the overall budget and its category's. Receipts keep the category, `reinpay report` sums spending per category, and shared payee lists carry it.
- **Payment hours.** `reinpay rule hours 9-18` (local time; `22-6` wraps past midnight; `--weekdays` skips Saturday and Sunday). Outside those hours every payment waits for `reinpay approve`, even inside your rules. Hard limits still block first.
- **Payments per hour.** `reinpay rule per-hour 10` blocks a payment when 10 were already sent or are waiting in the last 60 minutes, so an agent cannot drain a budget in many small steps. Blocked requests do not count.

### Working with others

- `reinpay payee export [--out=file.json]` writes your active payees (names, addresses, tokens and limits) to a file signed with your wallet key. `reinpay payee import <file>` (terminal only) checks the signature and shows who signed it, then adds only payees that pass the same checks as `payee add`. Addresses already on your list, names you already use, expired payees and anything that starts and ends like a payee you have (or your wallet) are skipped and listed. Token contracts are still refused.
- Webhook notifications are signed. `reinpay notify webhook <url>` prints a secret once; each POST carries `x-reinpay-timestamp` and `x-reinpay-signature: sha256=<hex>`, the HMAC-SHA256 of `<timestamp>.<body>`. Check it on your server and refuse anything older than five minutes. `reinpay notify secret` makes a new secret.
- `reinpay mcp --read-only` runs the MCP server without `request_payment`, for agents that should only read the wallet, check payments and verify receipts. They can still pull the brake with `freeze_wallet`.

### Why, rule by rule

`reinpay check <payee> <amount> [token] --explain` prints every rule in the order Reinpay runs them, each with what it found: ✓ passed, ✗ blocks, ⏸ waits for you, · not set. The rule that decided is marked `← decided`, and the rules after a block or a hold are shown as not reached, because Reinpay stops at the first one. When the rules let the payment through, the mainnet simulation is the last line, with its block and fee. The explanation is built next to the real decision and marks the rule that decision names, so the two cannot disagree. The `check_payment` tool takes `explain: true` too, so an agent can tell you exactly why. Nothing is recorded or signed.

### Plans

`reinpay check --plan=payments.json` takes a JSON list of payments (`[{"payee": "Weather API", "amount": "0.0005", "token": "ETH", "memo": "..."}]`, up to 50) and checks them in order as if the agent asked for all of them now. Each payment sees the ones before it as waiting, so the daily budget, the repeat guard and the per-hour cap add up the way they would for real: you see which would be ready, which would wait for you, and where the budget runs out. Payments the rules let through are simulated on mainnet, each from today's balance on its own. Nothing is recorded or signed. `--json` gives the same as data.

### Today

`reinpay today` is one screen for the owner: today's budget per token as a bar (█ sent, ▓ waiting, ░ left) with the numbers, the wallet balances read from the chain, every payment waiting for you with why and how long ago, what was blocked today and by which rule, the next bills, and the brakes (frozen, circuit breaker, autosend). It reads only; nothing changes. `--json` gives the same as data. If the chain cannot be read, the balances line says so and the rest still shows.

### Payee check

`reinpay payee check <0xaddress>` reads an address from Robinhood Chain before you add it: a wallet, a contract or a token contract; how many transactions it has sent; its ETH and USDG balance; whether a contract is verified on Sourcify; whether it is already on your list; and whether it starts and ends like one of your payees or your own wallet. Then one verdict: looks fine, be careful, or do not add, with the reason and the `payee add` command when it makes sense. Nothing is added or changed. `--json` gives the same as data.

### Payee add checks first

`reinpay payee add` now runs `payee check` before it adds anything and shows what it found. A wallet with a history is added. A fresh address with no history, or a contract, waits until you type `yes` (or pass `--yes`). A token contract or your own wallet is refused, `--yes` or not, and a lookalike still goes to the lookalike guard, which wants the full address typed again. If the chain cannot be read, it says so and asks before adding without the check. `--no-check` skips it.

### Rules history

Every time your rules or payees are sealed, Reinpay adds one entry to `rules-history.json`: what changed (before → after), when, a snapshot, a link to the entry before it, and a signature from your wallet key. `reinpay rules history [--last=10] [--json]` lists the changes (a payee added or removed whole reads as one line) and checks the chain: every entry signed by this wallet, unchanged since, in order, nothing removed, and the rules sealed now are the last entry. An edit to the file shows up as a problem. Notification tokens and webhook URLs are kept only as a short fingerprint, so a new token still shows as a change without the secret being stored. The history starts with the first seal after you update.

### Approve, dry

`reinpay approve <RP-id> [RP-id ...] --dry` (or `--all --dry`) runs everything `approve` checks, in the same order and fresh now: still waiting and not expired, a co-signature if one is needed, not frozen, the payee still on your list, your rules as they are now, a new mainnet simulation with today's fee, and the config seal. Then it stops before your key is opened and says whether the payment would be signed. Nothing is recorded, nothing changes on the receipt, and it needs no passphrase. `--json` gives the steps as data.

### Dry runs and grants

`reinpay check <payee> <amount> [token]`, and the `check_payment` tool for the agent, say what would happen to a payment right now: blocked (and by which rule), waiting for you, ready, or sent. If the rules would let it through, it is simulated on mainnet too. Nothing is recorded, nothing counts against a budget, and the circuit breaker does not see it, so an agent can plan without getting blocked.

`reinpay grant <token> <amount> --for=2h [--note=...]` adds to today's budget until the time is up (at most 30 days). `reinpay grant list` shows them, `reinpay grant clear` removes them. Grants are part of the sealed rules.

### Moving to another computer

`reinpay backup [--out=file.json]` writes the keystore exactly as it is (still encrypted with your passphrase), the config, the receipts and a freeze if there is one. It never includes the passphrase file. On the new computer, install Reinpay and run `reinpay restore file.json` (terminal only). It refuses to overwrite a wallet, refuses a file that was changed, and checks the config seal. Use `--profile=<name>` to restore next to an existing wallet. Treat the backup like the key itself: anyone with the file and your passphrase has the wallet.

### Statements

`reinpay statement` writes every sent payment in a period (30 days by default) to a JSON file, with totals per token, and signs it with the wallet's key. Share it with whoever needs to see what your agent spent. `reinpay statement check <file>` needs no wallet: it confirms the file was signed by the wallet it names, that nothing was added, removed or changed after signing, and reads every payment back from Robinhood Chain. Memos are included, so read the file before you share it.

### Digest

`reinpay digest` sends today's totals, what is waiting for you and what blocked most, to the Telegram or webhook you set up with `reinpay notify` (`--days=7` for a week, `--dry` to print it instead). It is read-only, so it is safe to run from cron or Task Scheduler, for example every evening: `0 20 * * * reinpay digest`.

### Brakes

- `reinpay freeze [reason]` stops everything at once: requests are blocked, autosend stops and approvals are refused. `reinpay unfreeze` (terminal only) asks whether you checked your receipts first.
- The circuit breaker freezes the wallet by itself when the agent is blocked 5 times within 10 minutes, which usually means it is looping or following instructions it should not. You get a notification if you set one up. Change it with `reinpay rule breaker <count> <minutes>`, or `reinpay rule breaker off`.
- Your agent can pull the brake too, with the `freeze_wallet` tool. It can never unfreeze.
- Payees can expire: `--until=30d` on `payee add`, or `reinpay payee until <name> 30d|off` later. An expired payee is blocked and hidden from the agent.
- The freeze lives in `~/.reinpay/frozen.json`, apart from the sealed config.

### Lookalike payees

Address poisoning scams send you dust from an address that starts and ends like one you already pay, hoping you copy it from your history. `reinpay payee add` refuses a new address whose first and last 4 characters match a payee you already have, or your own wallet, and shows both side by side. If you checked it with the payee and it is right, type the new address again in full to add it anyway. `reinpay doctor` keeps pointing at such pairs.


### Payee proof

`reinpay payee challenge <payee>` prints a short text that names the payee, its address and your wallet. The payee signs it as a message with that address (any wallet's "sign message" works; Reinpay never sees their key) and sends you the signature. `reinpay payee prove <payee> <0xsignature>` checks that the signature really comes from the payee's address and records it. With `reinpay rule require-proven on`, payments to payees without a proof wait for you (rule `unproven payee`). Contract payees cannot sign, so they are not held by this rule. A proof is tied to your wallet and the payee's name, so it is never copied into shared payee lists.

### Shared receipts

`reinpay share <RP-id> [--out=file.json]` writes a proof of one sent payment, signed with your wallet key: payee, amount, token, transaction. Send it to the payee, a client or an accountant. `reinpay share check <file>` needs no wallet: it confirms your wallet signed it, that nothing in it was changed, and reads the payment back from Robinhood Chain. Only sent payments can be shared.

### Sandbox

`reinpay sandbox` is a tour with no money and no setup. It makes a throwaway wallet in a temporary folder, gives it a pretend 1 ETH that exists only inside the simulation and the balance read, and sends five requests through the real rules and real `eth_simulateV1` calls on Robinhood Chain mainnet: one inside the rules, a repeat, one above the approval line, one above the max, and a payee that is not on the list. You see each decision and its reason. Nothing is signed or sent, your own wallet is not touched, and the folder is deleted at the end.

### Review

`reinpay review [--days=30]` reads your own receipts and suggests changes, each with the command to make it. It flags payees not paid in 30 days, a daily budget that keeps blocking requests or is far bigger than what is used (with a smaller number), an agent asking for payees that are not on the list, payments left waiting for more than a day, and missing safety switches (notifications, the circuit breaker, a per-hour cap and the first-payment rule when autosend is on). It is local and read-only: nothing is changed.

### Tools that help the agent help you

Two more read-only MCP tools: `spending_report` (sent, waiting and blocked per day and token, top payees, what blocked most) lets an agent answer "what did you spend this week?" from the receipts instead of guessing, and `review_rules` gives it the same suggestions as `reinpay review`, so it can pass them on to you with the commands to run. Neither can change anything, and both are available with `reinpay mcp --read-only`.

### Session budgets

`reinpay mcp --session=USDG:5,ETH:0.002` caps what one run of the MCP server may spend in all, on top of every other rule: a task gets 5 USDG, and when the agent host restarts the server, it is a new session. Tokens not named get nothing in that session. Receipts carry the session id, and `get_rules` shows the agent its session caps.

### Finding receipts

`reinpay receipts` takes filters: `--payee=` (part of a name, or an address), `--token=`, `--since=2026-11-01`, `--until=` (that whole day included), `--memo=` (text in the memo), `--rule=`, `--session=`, `--status=` (several with commas) and, with `--token`, `--min=` and `--max=`. They work with `--json` and `--csv` too, so `reinpay receipts --payee="GPU" --since=2026-11-01 --csv` is one month of one payee for a spreadsheet. The agent's `list_receipts` tool takes the same filters.

### HTML report

`reinpay report --html --out=report.html [--days=30]` writes the spending report as one self-contained page: totals per token with a bar chart per day, top payees, categories and what blocked most. It has no scripts and loads nothing from the internet, every name and memo is escaped, and it follows the reader's light or dark setting. Without `--out` it prints the page.

### Two-person approval

`reinpay rule cosign <0xaddress> <token> <amount>` sets a line above which a payment needs a second person: it waits for you (rule `co-sign`), and `reinpay approve` refuses until it also has a signature from that address. `reinpay cosign-message <RP-id>` prints the text to send them; it names your wallet, the receipt, the exact amount, token and payee, so a co-signature cannot be reused for anything else. Then `reinpay approve <RP-id> --cosig=0x…`. The co-signature is checked before the chain is read or your key is opened. `reinpay rule cosign off` removes it.

### Max network fee

`reinpay rule max-fee 0.0001` blocks a payment while its network fee would be above 0.0001 ETH (rule `network fee`). The fee is worked out from the mainnet simulation's gas and the current gas price, with the usual 20% margin, so a sudden spike in gas never surprises you. `off` removes it.

### Books

`reinpay books --month=2026-11` sums one month of sent payments; `--csv` gives one row per payment for a spreadsheet or an accountant: date, receipt, payee and address, category, token, amount, USD value, network fee, transaction and memo. The USD value is the one recorded at the time (USDG one to one, ETH at the stored two-pool price); payments made before USD values were recorded are counted and left blank rather than guessed. Memos that look like formulas stay text.

### Notifications you can count on

A Telegram or webhook message that fails because of a timeout, a 429 or a 5xx is tried again after 1 second and then 3 seconds. A 4xx such as a wrong token is not retried. `reinpay notify log [--last=50] [--json]` lists the last deliveries: when, which event and receipt, sent or failed, and how many tries. The log keeps only the type and host, never a bot token, a webhook path or a secret.

### Memo privacy

Memos can name clients or projects. `--no-memos` leaves them out of `reinpay statement`, `reinpay share` and `reinpay books`. `reinpay notify memos off` keeps them out of Telegram messages and webhook bodies. `reinpay redact <RP-id> [--reason=...]` (terminal only) removes one receipt's memo for good and notes on the receipt that it was redacted.

### Connect your agent host

`reinpay connect claude` (or `cursor`, `vscode`, `windsurf`, `codex`; no name prints them all) prints the exact command or config snippet for that host, with your flags: `--read-only`, `--session=USDG:5`, and `--profile=<name>`, which also gets its own server name. It only prints; it never edits a host's files. `reinpay mcp --check` starts the server the way a host does and lists its tools, so you know it works before you restart the host.

### Staying up to date

`reinpay --version --check` asks GitHub whether a newer Reinpay is out and, if so, prints the update command. It reads the public `package.json` and sends nothing about you or your wallet; updating is always your own command. `reinpay changelog [--since=0.20.0]` prints what changed, from the CHANGELOG of the version you have installed.

## Tools for the agent

| Tool | What it does |
| --- | --- |
| `wallet_status` | Address, ETH and USDG balances, today's budget left per token, the rules |
| `get_rules` | The rules and the payees the agent may pay |
| `request_payment` | Ask for one payment; returns the decision and the receipt |
| `get_receipt` | One receipt by id |
| `list_receipts` | Recent receipts, optionally by status |
| `verify_receipt` | Read a sent payment back from the chain and check it against its receipt |
| `read_payment_link` | Read an ethereum: payment link: who, how much, and whether the payee is on the list. Pays nothing |
| `spending_report` | Sent, waiting and blocked per day and token, top payees, what blocked most |
| `review_rules` | Suggestions for the owner's rules, each with the command to run |
| `check_payment` | Dry run: what would happen to a payment now, without recording anything |
| `freeze_wallet` | Stop every payment until the owner unfreezes it (the agent can freeze, never unfreeze) |

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
- `rules-history.json`: every change to the rules and payees, signed and chained (notification secrets only as a fingerprint).

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

`test/rules.test.mjs` checks every rule offline, `test/lock.test.mjs` the spend lock (including two processes), `test/report.test.mjs` the spending report, `test/notify.test.mjs` the owner notifications, `test/csv.test.mjs` the CSV export and `test/profile.test.mjs` the profiles, `test/seal.test.mjs` the config seal and unlock, `test/guard.test.mjs` the lookalike guard, `test/verify.test.mjs` the on-chain receipt check and `test/doctor.test.mjs` the checkup and `test/freeze.test.mjs` the freeze, the circuit breaker and expiring payees, `test/paper.test.mjs` statements, the first-payment rule and the digest, `test/plan.test.mjs` grants, dry runs and backup/restore, `test/share.test.mjs` shared payee lists, signed webhooks and read-only MCP, `test/smart.test.mjs` category budgets, payment hours and the per-hour cap, `test/bills.test.mjs` payment links, schedules and budget alerts, `test/failclosed.test.mjs` the token-contract check when the chain cannot be read, `test/approvals.test.mjs` the memo rule and expiring requests, `test/fleet.test.mjs` the view across profiles, and `test/usd.test.mjs` the two-pool price and the dollar limits. `test/proof.test.mjs` payee proofs. `test/sharereceipt.test.mjs` shared receipts.  `test/review.test.mjs` the rule review.  `test/session.test.mjs` session budgets. `test/search.test.mjs` receipt filters. `test/htmlreport.test.mjs` the HTML report. `test/cosign.test.mjs` two-person approval. `test/fee.test.mjs` the max fee. `test/books.test.mjs` the monthly books. `test/retry.test.mjs` notification retries. `test/memos.test.mjs` memo privacy. `test/connect.test.mjs` host snippets and the server check. `test/update.test.mjs` the version check and changelog. `test/explain.test.mjs` check --explain. `test/planlist.test.mjs` plans. `test/today.test.mjs` the today screen. `test/payeecheck.test.mjs` the payee check. `test/addcheck.test.mjs` the check inside payee add. `test/history.test.mjs` the rules history. `test/approvedry.test.mjs` approve --dry. `test/live.mjs` runs on mainnet:

- USDG transfer simulations from a public holder, and tampered ones that must be refused;
- the full flow with a throwaway wallet that has a pretend ETH balance only inside the simulation;
- two requests at the same moment against one budget, and a payee's own daily budget;
- a token contract refused as a payee, weekly budgets, and a notification attempt logged on the receipt;
- a Sourcify-verified token added and spent only after its budget is set, and an unverified one refused;
- the MCP server over stdio;
- `verify` against a real public token transfer and a real ETH payment from the last few hundred blocks, and altered copies that must not match;
- `doctor` against the real RPC, and the lookalike guard;
- the agent freezing the wallet over MCP, and its next request blocked;
- statements built from a real public payment: one with the wrong signer and one claiming someone else's payment, both refused;
- a dry run simulated on mainnet that records nothing, `check_payment` over MCP, `check --explain` with the simulation as its last step, a `check --plan` whose repeat is held, `today` with balances from the chain, `payee check` on the USDG contract, `payee add` asking first about a fresh address, and `approve --dry` stopping before signing;
- the read-only MCP server over stdio, and a shared payee list whose token contract is still refused;
- a category budget on the real payment path, before and after the mainnet simulation;
- a payment link and a scheduled payment through the real payment path, and `read_payment_link` over MCP;
- the ETH price read from two WETH/USDG pools on mainnet, and a dollar limit blocking and allowing ETH payments at that price.

No transaction is signed or sent.

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
