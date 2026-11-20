# Changelog

## 0.51.0 (unreleased): Reinpay Lab

- `reinpay lab run [--out=] [--json]`: seven scams against five rule sets on throwaway wallets, real rules and real mainnet simulations, nothing signed; wording drawn from a block hash; each cell paid, held or blocked with the deciding rule.
- Tests: 11 checks offline.

## 0.50.0 (unreleased): selftest

- `reinpay selftest [--live] [--json]`: Reinpay's own tests, run on this computer, each in its own process with a temporary home. The `test` folder now ships with the install.
- Tests: 7 checks offline.

## 0.49.0 (unreleased): agent prompt

- `reinpay prompt [--read-only] [--out=]`: instructions for your agent on using the tools safely, with your rules in plain words.
- Tests: 7 checks offline.

## 0.48.0 (unreleased): rules in plain words

- `reinpay rules --plain`: every rule as a sentence, one line per payee. `get_rules` carries the same sentences as `inPlainWords`.
- Tests: 9 checks offline.

## 0.47.0 (unreleased): a payee's own approval line

- `reinpay payee limit <name> ask-above <token> <amount|off>`: above it, payments to that payee wait for you (rule `payee approval line`). In `check --explain`, `headroom` and shared payee lists (which now carry the cooldown too).
- Tests: 8 checks offline.

## 0.46.0 (unreleased): balance share

- `reinpay rule balance-share <percent|off>`: one payment may be at most this share of the wallet's balance of that token, read from the chain; fails closed when it cannot be read. In `check --explain`, `--plan`, `approve --dry`, `headroom`, `get_rules` and rules files.
- Tests: 8 checks offline.

## 0.45.0 (unreleased): payments per day

- `reinpay rule per-day <count|0>`: at most this many payments sent or waiting per local day (rule `payments per day`). In `check --explain`, `headroom`, `get_rules` and rules files.
- Tests: 7 checks offline.

## 0.44.0 (unreleased): rules files

- `reinpay rules export [--out=]` and `reinpay rules import <file>`: rules in a signed file; import checks the signature, shows every change and asks for yes. Grants, the co-signer and autosend are never shared.
- Tests: 11 checks offline.

## 0.43.0 (unreleased): blocked words in memos

- `reinpay rule memo-block <add|remove> <word ...> | off`: a memo with one of these words or phrases is refused (rule `memo words`). Case-insensitive, whole words. `get_rules` says the list exists without showing it.
- Tests: 8 checks offline.

## 0.42.0 (unreleased): payee cooldown

- `reinpay payee cooldown <name> <minutes|off>`: at least this long between payments to one payee, counting sent and waiting ones. Shown in `check --explain` and `headroom`.
- Tests: 10 checks offline.

## 0.41.0 (unreleased): payee rename

- `reinpay payee rename <name> <new name>`: address, limits and proof stay; schedules follow. The rules history shows renames, and schedules added or removed, as one line each.
- Tests: 10 checks offline.

## 0.40.0 (unreleased): rule templates

- `reinpay rules template [cautious|balanced|open] [--json]`: a ready rule set compared with yours, as the commands to run. Prints only.
- Tests: 11 checks offline.

## 0.39.0 (unreleased): why

- `reinpay why <RP-id> [--json]`: one past decision replayed rule by rule, with the rules sealed at the time (from the rules history) and the payments before it, and whether it matches the receipt.
- Tests: 9 checks offline.

## 0.38.0 (unreleased): headroom

- `reinpay headroom [--json]`: per payee and token, the largest amount that would go through without you, the largest that would wait for you, and the rule that stops it above that. Found by asking the rules engine itself.
- Tests: 9 checks offline, including that every number agrees with the decision at it and one unit above it.

## 0.37.0 (unreleased): approve, dry

- `reinpay approve <RP-id> ... | --all --dry [--json]`: every check approve makes, fresh now, including a new mainnet simulation, then it stops before signing. Nothing recorded or changed, no passphrase.
- Tests: 9 checks offline and 1 live check.

## 0.36.0 (unreleased): rules history

- Every seal adds a signed, chained entry to `rules-history.json` with what changed. `reinpay rules history [--last=N] [--json]` lists them and checks the signatures, the chain and that the rules sealed now are the last entry. Notification secrets are stored only as a fingerprint.
- Tests: 14 checks offline.

## 0.35.0 (unreleased): payee add checks first

- `reinpay payee add` runs `payee check` first: a wallet with a history is added, a fresh address or a contract asks for `yes` (or `--yes`), a token contract or your own wallet is refused, a lookalike goes to the lookalike guard. `--no-check` skips it.
- Tests: 7 checks offline and 1 live check.

## 0.34.0 (unreleased): payee check

- `reinpay payee check <0xaddress> [--json]`: wallet or contract, history, balances, Sourcify, already on the list, lookalikes; then looks fine, be careful or do not add, with the reason. Read-only.
- Tests: 9 checks offline and 1 live check.

## 0.33.0 (unreleased): today

- `reinpay today [--json]`: budget bars per token (sent, waiting, left), balances from the chain, waiting payments with why and age, blocked today per rule, next bills and the brakes. Read-only.
- Tests: 9 checks offline and 1 live check.

## 0.32.0 (unreleased): plans

- `reinpay check --plan=payments.json [--json]`: up to 50 payments checked in order as if all were asked for now; each sees the ones before it, so budgets, the repeat guard and the per-hour cap add up. Payments that pass the rules are simulated on mainnet. Nothing is recorded or signed.
- Tests: 12 checks offline and 1 live check.

## 0.31.0 (unreleased): why, rule by rule

- `reinpay check <payee> <amount> [token] --explain`: every rule in order with what it found (✓ ✗ ⏸ ·), the one that decided marked, the rest after a block or hold shown as not reached, and the mainnet simulation as the last line.
- `check_payment` takes `explain: true` and returns the same steps.
- Tests: 18 checks offline, including 400 random requests where the explanation must name the same rule as the decision.

## 0.30.0 (unreleased): stay up to date

- `reinpay --version --check`: compares the installed version with the public `package.json` on GitHub and prints the update command when a newer one is out. Never installs anything by itself.
- `reinpay changelog [--since=X.Y.Z]`: the installed CHANGELOG, newest first.
- Fixed: `reinpay sandbox` now puts back whatever simulation settings were in place before it ran, instead of clearing them. Found by the live tests.
- Tests: 7 checks offline.

## 0.29.0 (unreleased): connect

- `reinpay connect [claude|cursor|vscode|windsurf|codex] [--read-only] [--session=]`: the command or config snippet for each host, with the right args and a per-profile server name. Prints only.
- `reinpay mcp --check [--read-only]`: starts the MCP server over stdio and lists its tools.
- Tests: 9 checks, including starting a real MCP server.

## 0.28.0 (unreleased): memo privacy

- `--no-memos` for `statement`, `share` and `books`; `reinpay notify memos <on|off>` for notifications (sealed); `reinpay redact <RP-id> [--reason=]` to remove a memo for good, with a note in the receipt's history.
- Tests: 8 checks offline.

## 0.27.0 (unreleased): reliable notifications

- Notifications retry up to 3 times on timeouts, network errors, 429 and 5xx (waiting 1 s, then 3 s); other errors are not retried. Every delivery is logged in `notify-log.json` (last 200, type and host only). `reinpay notify log [--last=N] [--json]` shows it.
- Tests: 6 checks offline, including that the bot token never reaches the log.

## 0.26.0 (unreleased): books

- `reinpay books --month=YYYY-MM [--csv | --json]`: one month of sent payments with totals per token, a USD total and a count of payments without a USD value. The CSV has one row per payment, formula-safe. (Named `books`, not `export`, because `reinpay export` shows the private key.)
- Tests: 7 checks offline.

## 0.25.0 (unreleased): max network fee

- `reinpay rule max-fee <eth|off>`: a payment whose estimated network fee (simulated gas × gas price × 1.2) is above the line is blocked (rule `network fee`) on request, in `check_payment` and on approval.
- Tests: 4 checks offline and 1 live check against the real gas price.

## 0.24.0 (unreleased): two-person approval

- `reinpay rule cosign <0xaddress> <token> <amount> | off`, `reinpay cosign-message <RP-id>` and `reinpay approve <RP-id> --cosig=0x…`: above the line, a payment waits (rule `co-sign`) and is only signed with a valid signature from the co-signer over a message naming that exact payment. Checked first, before anything else in an approval. The co-signer cannot be the wallet itself.
- Tests: 11 checks offline.

## 0.23.0 (unreleased): HTML report

- `reinpay report --html [--out=report.html]`: a self-contained page with totals, an inline SVG bar chart per token, top payees, categories and blocked-by. No scripts, no outside requests, all receipt text escaped.
- Tests: 7 checks offline, including a payee name that tries to inject markup.

## 0.22.0 (unreleased): finding receipts

- `reinpay receipts` filters: payee, token, since, until, memo, rule, session, several statuses, and min/max with a token. They apply to the list, `--json` and `--csv`. `list_receipts` over MCP takes the same filters.
- Tests: 12 checks offline.

## 0.21.0 (unreleased): session budgets

- `reinpay mcp --session=TOKEN:amount,...`: a spending cap for one run of the MCP server (rule `session budget`), counting what that session sent or has waiting. Tokens not named are blocked in the session. Receipts store the session id; `get_rules` shows `thisSession`.
- Tests: 11 checks offline and 1 live check over a real MCP server run.

## 0.20.0 (unreleased): the agent can explain

- New read-only MCP tools `spending_report` and `review_rules` (eleven tools in all, ten in read-only mode). The agent can report spending from the receipts and pass rule suggestions to the owner; it still cannot change a rule.
- Tests: the MCP tool counts and 2 new live checks over stdio. All passing. No transaction is signed or sent.

## 0.19.0 (unreleased): review

- `reinpay review [--days=30] [--json]`: suggestions from your own receipts, safety first, each with the command to run. Read-only and local.
- Tests: 11 checks offline. All passing.

## 0.18.0 (unreleased): sandbox

- `reinpay sandbox`: a no-money tour through the real rules and real mainnet simulations, with a throwaway wallet whose pretend ETH exists only inside the simulation. Runs in its own temporary folder, restores the environment, deletes the folder.
- Tests: 2 new live mainnet checks. All passing. No transaction is signed or sent.

## 0.17.0 (unreleased): shared receipts

- `reinpay share <RP-id> [--out=file.json]`: a signed proof of one sent payment (a one-payment statement marked `purpose: "receipt"`, so it cannot be passed off as a full statement). `reinpay share check <file>` checks the signature and the payment on the chain.
- Tests: 7 checks offline. All passing.

## 0.16.0 (unreleased): payee proof

- `reinpay payee challenge <payee>` and `reinpay payee prove <payee> <0xsignature>`: a payee proves it controls its address by signing a message that names the payee, its address and your wallet. The proof is checked with signature recovery and stored on the payee.
- `reinpay rule require-proven <on|off>`: payments to unproven payees wait for the owner (rule `unproven payee`). Contract payees are not held by it. `get_rules` shows which payees are proven.
- Tests: 11 checks offline. All passing.

## 0.15.0 (unreleased): limits in dollars

- `reinpay rule usd max <amount|off>` and `reinpay rule usd daily <amount|off>`: a cap per payment and a daily budget in dollars across USDG and ETH (rules `usd max`, `usd daily budget`).
- ETH is priced from `slot0` of two WETH/USDG pools on Robinhood Chain, checked to really be WETH/USDG. No price (a pool down, a wrong pair, or the two more than 2% apart) means the payment is blocked (rule `usd price`). Tokens other than USDG and ETH are blocked while USD rules are on.
- Receipts store `usdValue` and `ethPriceUsdg`. Approvals and `check_payment` use a fresh price. `reinpay price` shows both pools and the price in use. `get_rules` tells the agent.
- Tests: 17 checks offline with a pretend chain (including a manipulated pool), plus 3 new live mainnet checks with the real price. The live test now looks for a public USDG holder in a shorter window, since USDG traffic on Robinhood Chain has grown. All passing. No transaction is signed or sent.

## 0.14.0 (unreleased): many agents

- `reinpay profiles --status [--json]`: every wallet on this computer on one screen, from local files only: locked or unlocked, autosend, frozen and by whom, today's spend against the budget, payments waiting for you, requests blocked today.
- `reinpay freeze --all [reason]` and `reinpay unfreeze --all` (terminal only, one yes after listing what is frozen).
- `reinpay digest --all`: one summary for every wallet, sent through the default profile's notifications.
- Tests: 11 checks offline, including the CLI against a throwaway home folder. All passing.

## 0.13.0 (unreleased): approvals

- `reinpay approve <RP-id> [RP-id ...] | --all`: approve several waiting payments with one yes and one passphrase. Each one is checked against the rules and simulated again before it is signed; a failure on one does not stop the rest.
- `reinpay rule expire-after <24h|90m|off>`: waiting payments older than that become `expired`, stop holding the budget and cannot be approved. Checked when requests are made, listed or approved.
- `reinpay rule memo <min-chars|off>`: requests whose memo is shorter are blocked (rule `memo`). `get_rules` tells the agent; `check_payment` accepts a memo.
- Tests: 13 checks offline. All passing.

## 0.12.0 (unreleased): bills

- Scheduled payments: `reinpay schedule add <payee> <amount> <token> <daily|weekly|monthly> [--start=] [--memo=]`, `schedule list | pause | resume | remove`, and `schedule run` for cron. Every due payment goes through every rule and the mainnet simulation, and waits for the owner unless autosend is on and the wallet is unlocked. Missed slots are skipped. Schedules are part of the sealed config (a config without schedules seals exactly as before); run state lives in `schedules-state.json`, so runs never break the seal. `schedule run` refuses to run if the seal does not match.
- Payment links: `reinpay pay <ethereum:… link>` reads EIP-681 links (ETH `value=`, ERC-20 `transfer?address=&uint256=`), refuses other chains, other functions and payees not on the list, then asks for the payment like any other. `reinpay link <payee> <amount> [token]` makes one. New read-only MCP tool `read_payment_link`.
- Budget alerts: `reinpay notify at <percent|off>` sends one message a day per token once that share of today's budget is used (event `budget_alert`).
- Fixed: when Robinhood Chain could not be read (a rate limit or a timeout), the check that refuses token contracts as payees treated the address as "not a token" and let it through. It now refuses and asks you to try again, both in `payee add` and at payment time. Found by the live tests under a rate limit.
- Tests: 29 link, schedule and alert checks and 3 fail-closed checks offline, plus 5 new live mainnet checks. All passing. No transaction is signed or sent.

## 0.11.0 (unreleased): smarter rules

- Category budgets: `reinpay payee category <payee> <name|off>` and `reinpay rule category <name> daily <token> <amount|off>`. Every payee in a category shares that daily budget, on top of the overall one (rule `category budget`). Receipts store the category, `reinpay report` adds a By category section, shared payee lists carry it, and `get_rules` shows it.
- Payment hours: `reinpay rule hours <9-18|off> [--weekdays]`, local time, wrapping past midnight for ranges like `22-6`. Outside them every payment waits for the owner (rule `quiet hours`); hard limits still block first.
- Payments per hour: `reinpay rule per-hour <count|0>` blocks a payment once that many were sent or are waiting in the last 60 minutes (rule `payments per hour`). Blocked requests do not count.
- All three are off by default, so existing configs and their seals are unchanged.
- Tests: 25 checks offline, plus 2 new live mainnet checks. All passing. No transaction is signed or sent.

## 0.10.0 (unreleased): working with others

- `reinpay payee export [--out=file.json]` and `reinpay payee import <file>`: share a payee list signed with your wallet key. Import checks the signature, says who signed it (and warns when it is not this wallet), and adds only payees that pass the same checks as `payee add`; duplicates, taken names, expired payees and lookalike addresses are skipped and listed, and token contracts are still refused.
- Signed webhooks: a webhook set up with `reinpay notify webhook <url>` gets a secret, printed once. Every POST carries `x-reinpay-timestamp` and `x-reinpay-signature` (`sha256=` HMAC-SHA256 of `<timestamp>.<body>`), so the receiving server can reject anything forged or replayed. `reinpay notify secret` rotates it. Webhooks set up before 0.10 keep working unsigned until you run it.
- `reinpay mcp --read-only`: the MCP server without `request_payment`, for agents that should only read, dry-run and verify. `freeze_wallet` stays available.
- Tests: 22 payee-list, webhook and read-only checks offline, plus 4 new live mainnet checks. All passing. No transaction is signed or sent.

## 0.9.0 (unreleased): plan and move

- Dry run: `reinpay check <payee> <amount> [token]` and the new MCP tool `check_payment` say what would happen to a payment right now (blocked with the rule, waiting for you, ready or sent), simulated on mainnet when the rules would let it through. No receipt, nothing counted against a budget, nothing signed, and the circuit breaker does not count it.
- Budget grants: `reinpay grant <token> <amount> --for=2h [--note=...]` adds to today's budget until the time is up (up to 30 days); `grant list` and `grant clear`. Grants live in the sealed rules; `get_rules` shows them inside today's budget.
- `reinpay backup [--out=file.json]` and `reinpay restore <file>`: move a wallet to another computer. The keystore stays encrypted, the passphrase file is never included, files are written readable by the owner only. Restore refuses to overwrite a wallet, refuses a backup whose hash does not match, and reports the config seal.
- Tests: 24 grant, dry-run and backup checks offline, plus 2 new live mainnet checks. All passing. No transaction is signed or sent.

## 0.8.0 (unreleased): proof and paperwork

- `reinpay statement [--days=30] [--out=file.json]`: every sent payment in the period, with totals per token, signed with the wallet's own key. `reinpay statement check <file>` needs no wallet: it checks that the wallet named in the file signed it, that it was not changed after signing, and reads every payment back from Robinhood Chain. A statement signed by someone else, or listing a payment the wallet did not make, is refused.
- First-payment rule: `reinpay rule first-payment ask` makes the first payment to every payee wait for the owner, even inside the approval line. Hard limits still apply first. `off` turns it off (the default).
- `reinpay digest [--days=1] [--dry]`: a short summary (sent, waiting, blocked, what blocked most, and a freeze if there is one) sent to the owner's Telegram or webhook. Read-only, for a daily schedule.
- `get_rules` shows whether first payments need the owner.
- Tests: 23 statement, first-payment and digest checks offline, plus 3 new live mainnet checks. All passing. No transaction is signed or sent.

## 0.7.0 (unreleased): brakes

- `reinpay freeze [reason]`: one command stops every payment. Requests are blocked with the rule `frozen`, autosend stops even for a payment already decided, and `reinpay approve` refuses. `reinpay unfreeze` is terminal only and asks whether you checked your receipts. The state is kept in `frozen.json`, apart from the sealed config; an unreadable file counts as frozen.
- Circuit breaker: when the agent is blocked 5 times within 10 minutes, Reinpay freezes itself and notifies the owner (Telegram or webhook, event `frozen`). `reinpay rule breaker <count> <minutes>` or `off`. Requests blocked by the freeze itself, waiting payments and the owner's own test requests do not count.
- New MCP tool `freeze_wallet`: the agent can pull the brake if it notices it is being told to pay someone it should not. No tool can unfreeze.
- Expiring payees: `reinpay payee add ... --until=30d`, and `reinpay payee until <name> <30d|12h|90m|off>`. An expired payee is blocked (rule `payee expired`) and no longer shown to the agent.
- `reinpay doctor` has a tenth check, brakes; `reinpay status` and `get_rules` show the freeze and the breaker.
- Tests: 29 freeze/breaker/expiry checks offline and 2 more doctor checks, plus 4 new live mainnet checks. All passing. Nothing is signed or sent.

## 0.6.0 (unreleased): check it

- `reinpay verify <RP-id>` (and `--all`) reads a sent payment back from Robinhood Chain and checks it against its receipt: on chain 4663, confirmed and succeeded, the same block, sent from your wallet, one transfer out to the payee, the exact amount of the right token, no ETH sent along with a token call. Each check says what it compared. New MCP tool `verify_receipt`, so an agent can check a payment before telling you it arrived.
- Lookalike guard: `reinpay payee add` refuses an address that starts and ends like a payee you already have, or like your own wallet (address poisoning). To add it anyway you type the full address again. The payee is then marked as confirmed.
- `reinpay doctor` (`--json`): nine read-only checks with what to do next: Node.js version, wallet, RPC, chain id, config seal, unlock, ETH for network fees, payees (including lookalike pairs) and daily budgets. Exits with 1 when something must be fixed.
- Receipts now store the token contract address, so `verify` still works if a token is later removed from your list.
- Tests: 12 guard, 14 verify and 20 doctor checks offline, plus 17 new live mainnet checks. All passing. Nothing is signed or sent.

## 0.5.0 (unreleased): hardening

- Config seal: every change made with the owner's terminal commands (`rule`, `payee`, `token`, `notify`, `autosend`, and `init`) is signed with the wallet's own key. Before anything is signed, `reinpay approve` and autosend check that signature. If `config.json` was edited any other way (an agent with file access adding itself as a payee, raising a budget, turning autosend on), nothing is signed until the owner checks `reinpay rules` and runs `reinpay seal`. Existing wallets: run `reinpay seal` once after updating.
- Unlock that expires: `reinpay unlock --for=30m` (also `2h`, `1d`; `0` keeps it until `reinpay lock`). The default is 12 hours. When the time is up the passphrase file is removed and signing needs the passphrase again.
- `reinpay status` shows the seal and how long the wallet stays unlocked.
- Tests: 55 rule, 7 lock, 9 report, 11 notification, 10 CSV, 9 profile and 15 seal/unlock checks offline, and 59 live mainnet checks. All passing. Nothing is signed or sent.

## 0.4.1 (unreleased): security fix

- Fixed: `reinpay approve` signed the raw transaction stored in `receipts.json`, while the second simulation used a transaction built fresh from the payee list and the amount. Anything able to edit `receipts.json` could have made the owner approve one payment and sign another. Approve now builds the transaction from the payee list and the amount, simulates exactly that transaction, and signs exactly that transaction. Raw transactions are no longer written to `receipts.json` at all, and a receipt whose payee address is not on the payee list is refused. Reported publicly; thank you.
- README: a "Security model" section that states plainly what Reinpay protects against and what it does not (an agent that can run arbitrary shell commands as your user).
- Tests: 56 live mainnet checks, including a receipt edited to point at another address being refused with nothing signed.

## 0.4.0 (unreleased)

- One wallet per agent: `--profile=<name>` on any command (`reinpay init --profile=research`, `reinpay mcp --profile=research`). Each profile has its own key, rules, payees, receipts and spend lock in `~/.reinpay/profiles/<name>`; the default stays in `~/.reinpay`. `reinpay profiles` lists them. Names are 1-32 lowercase letters, digits or dashes.
- More tokens: `reinpay token add <0xaddress>` adds another ERC-20 on Robinhood Chain after checking that it has code, answers like a token (symbol and decimals), does not clash with a token already known, and is verified on Sourcify (exact or partial match). An added token cannot be spent until the owner sets its daily budget. `reinpay token list`, `reinpay token remove <SYMBOL>`. Balances, budgets and simulations cover added tokens; `request_payment` accepts any token `get_rules` lists.
- CSV export: `reinpay receipts --csv` (every receipt, oldest first) and `reinpay report --csv` (one row per day and token). Text that a spreadsheet would run as a formula, such as a memo starting with `=`, is written as plain text.
- The message for a token contract refused as a payee now names the token.
- Tests: 55 rule, 7 lock, 9 report, 11 notification, 10 CSV and 9 profile checks offline, and 53 live mainnet checks, including a Sourcify-verified token added and an unverified one refused. All passing. Nothing is signed or sent.

## 0.3.0 (unreleased)

- Token contracts are never payees. `reinpay payee add` refuses any address that answers like an ERC-20 token (its `decimals` and `totalSupply` can be read), because tokens sent to a token's own contract are almost always stuck for good. A token contract added to `config.json` by hand is blocked at payment time with the rule `token contract`. Contracts that are not tokens can still be payees and are flagged as contracts.
- Weekly and monthly budgets: `reinpay rule weekly USDG 100`, `reinpay rule monthly USDG 300` (`off` removes them). Local calendar weeks start on Monday. They are checked after the daily budget, counting payments sent and still waiting, and `get_rules` shows what is left.
- Owner notifications: `reinpay notify telegram <bot-token> <chat-id>` or `reinpay notify webhook <https-url>`, then `reinpay notify test`. When a payment waits for approval, the owner gets the id, amount, payee, the rule that held it and the command to approve or reject. The agent's memo is shortened and quoted. A failed notification never changes the payment; the result is written on the receipt. The bot token and webhook stay in `config.json` and are never shown to the agent.
- Tests: 55 offline rule checks, 7 lock, 9 report and 11 notification checks, and 42 live mainnet checks. All passing. Nothing is signed or sent.

## 0.2.0 (unreleased)

- Spend lock: deciding a payment (rules, mainnet simulation, receipt) now runs one at a time across every Reinpay process on the computer, so two requests at the same moment can no longer both spend the same budget left. The same lock covers `reinpay approve`. A lock left by a process that exited is cleared automatically.
- Per-payee daily budget: `reinpay payee limit <name> daily <USDG|ETH> <amount>` caps what one payee can receive per local day, on top of the wallet's daily budget. `reinpay payee limit <name> max ...` sets the payee's own max per payment from the terminal. `off` clears either. The agent sees each payee's limits and what is left today in `get_rules`.
- `reinpay report [--days=7] [--json]`: what was sent, what is waiting and what was blocked, per day and token, the top payees per token and the rules that blocked the most. Read from local receipts only.
- `reinpay approve` checks that the payment is still waiting and opens the wallet before taking the lock, so a wrong passphrase changes nothing.
- Tests: 43 offline rule checks, 7 lock checks (including two processes), 9 report checks, and 35 live mainnet checks, including two simultaneous requests against one budget. All passing. Nothing is signed or sent.

## 0.1.0 (unreleased)

First version: a wallet for AI agents that only spends inside the owner's rules, on Robinhood Chain mainnet (chain id 4663).

- Rules per token (USDG, ETH): daily budget, max per payment, approval line. A repeat guard holds the same payment asked again within 10 minutes.
- Payee list with per-payee tokens and an optional per-payee max. Payees can be switched off. Unlisted payees are always blocked.
- Every payment is simulated with `eth_simulateV1` (traceTransfers). It is refused unless exactly one transfer of the asked amount leaves the wallet, to the payee, and the wallet can pay the network fee.
- Receipts for every request: status, the rule that decided, the simulation, and the transaction once sent.
- MCP server with 5 tools: `wallet_status`, `get_rules`, `request_payment`, `get_receipt`, `list_receipts`. The agent cannot approve, reject, or change rules or payees.
- Owner commands in the terminal only: `init`, `unlock`/`lock`, `rule`, `payee`, `autosend`, `pending`, `approve` (re-checks the budget and simulates again before signing), `reject`, `receipts`, `export`.
- Encrypted key (scrypt + AES-256-GCM) in `~/.reinpay`.
- Tests: 33 offline rule checks and 30 live mainnet checks, all passing. Nothing is signed or sent.
