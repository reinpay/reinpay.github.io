// reinpay.app/app: tabs, a read-only wallet view, a rule builder that writes CLI commands, and a rules playground.
// The Reinpay wallet itself runs on the owner's computer; nothing here holds or asks for a key.
(() => {
  const $ = (id) => document.getElementById(id);
  // ---- tabs (hash-routed: #wallet #fund #rules #playground) ----
  const tabs = [...document.querySelectorAll(".tab")];
  function show(name) {
    if (!tabs.some((t) => t.dataset.tab === name)) name = "wallet";
    for (const t of tabs) {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", on ? "true" : "false");
      $("p-" + t.dataset.tab).hidden = !on;
    }
  }
  for (const t of tabs) t.addEventListener("click", () => { history.replaceState(null, "", "#" + t.dataset.tab); show(t.dataset.tab); });
  window.addEventListener("hashchange", () => show(location.hash.slice(1)));
  show(location.hash.slice(1));

  // ---- wallet: balances of any address on Robinhood Chain ----
  const RPC = "https://rpc.mainnet.chain.robinhood.com", USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
  const pad = (h) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  async function rpc(method, params) {
    if (window.ethereum) {
      try { const id = await window.ethereum.request({ method: "eth_chainId" }); if (id.toLowerCase() === "0x1237") return await window.ethereum.request({ method, params }); } catch {}
    }
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
  }
  const fmtU = (v, d, max = 6) => { const s = v.toString().padStart(d + 1, "0"); const w = s.slice(0, -d), f = s.slice(-d).replace(/0+$/, "").slice(0, max); return w + (f ? "." + f : ""); };
  async function readWallet() {
    const a = $("w-addr").value.trim(), msg = $("w-msg");
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) { msg.textContent = "Paste a 0x address, for example the one `reinpay address` prints."; msg.className = "fstatus err"; return; }
    msg.textContent = "Reading Robinhood Chain…"; msg.className = "fstatus";
    try {
      const [eth, usdg, block, code] = await Promise.all([
        rpc("eth_getBalance", [a, "latest"]), rpc("eth_call", [{ to: USDG, data: "0x70a08231" + pad(a) }, "latest"]), rpc("eth_blockNumber", []), rpc("eth_getCode", [a, "latest"]),
      ]);
      $("w-eth").textContent = fmtU(BigInt(eth), 18, 6); $("w-usdg").textContent = fmtU(BigInt(usdg), 6, 2);
      const link = $("w-explorer"); link.href = "https://robinhoodchain.blockscout.com/address/" + a; link.hidden = false;
      msg.textContent = `Read at block ${parseInt(block, 16).toLocaleString()}.${code && code !== "0x" ? " Note: this address is a contract, not a Reinpay wallet." : ""}`;
      msg.className = "fstatus " + (code && code !== "0x" ? "warn" : "ok");
      try { localStorage.setItem("reinpay-addr", a); } catch {}
      const to = $("f-to"); if (to && !to.value) to.value = a;
    } catch (e) { msg.textContent = "Could not read the chain from this browser (" + (e.message || "network error") + "). Connect a wallet on Robinhood Chain and try again."; msg.className = "fstatus err"; }
  }
  $("w-read").addEventListener("click", readWallet);
  try { const saved = localStorage.getItem("reinpay-addr"); if (saved) $("w-addr").value = saved; } catch {}

  // ---- rules: one set of inputs drives the CLI commands and the playground ----
  const R = () => ({ daily: +$("r-daily").value || 0, cap: +$("r-cap").value || 0, line: +$("r-line").value || 0, guard: +$("r-guard").value || 0 });
  function commands() {
    const r = R(), payees = [...document.querySelectorAll(".pp")].filter((x) => x.checked).map((x) => x.dataset);
    const lines = [
      "# set these in your own terminal",
      `reinpay rule daily USDG ${r.daily}`,
      `reinpay rule max USDG ${r.cap}`,
      `reinpay rule approve-above USDG ${r.line}`,
      `reinpay rule repeat-guard ${r.guard}`,
      ...payees.map((p) => `reinpay payee add "${p.name}" ${p.addr} --tokens=USDG`),
      "reinpay rules",
    ];
    $("r-cmds").textContent = lines.join("\n");
  }
  for (const id of ["r-daily", "r-cap", "r-line", "r-guard"]) $(id).addEventListener("input", () => { commands(); });
  document.querySelectorAll(".pp").forEach((x) => x.addEventListener("change", commands));
  $("r-copy").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText($("r-cmds").textContent.split("\n").filter((l) => !l.startsWith("#")).join("\n")); e.target.textContent = "Copied"; }
    catch { const rg = document.createRange(); rg.selectNodeContents($("r-cmds")); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); e.target.textContent = "Selected"; }
    setTimeout(() => (e.target.textContent = "Copy"), 1600);
  });
  commands();

  // ---- playground: the same order of checks as the wallet (payee, max, budget, repeat, approval) ----
  let log = [], n = 0;
  const allowed = () => new Set([...document.querySelectorAll(".pp")].filter((x) => x.checked).map((x) => x.dataset.name));
  function decide(req) {
    const r = R(), now = Date.now();
    const spent = log.filter((x) => x.status === "within rules").reduce((a, x) => a + x.amount, 0);
    const held = log.filter((x) => x.status === "waiting for you").reduce((a, x) => a + x.amount, 0);
    if (!allowed().has(req.payee)) return ["blocked", "payee list", `${req.payee} is not on your payee list.`];
    if (req.amount > r.cap) return ["blocked", "max per payment", `${req.amount} USDG is above your max of ${r.cap}.`];
    if (spent + held + req.amount > r.daily) return ["blocked", "daily budget", `Only ${Math.max(0, r.daily - spent - held).toFixed(2)} of ${r.daily} USDG is left today.`];
    const dup = log.find((x) => x.payee === req.payee && x.amount === req.amount && x.status !== "blocked" && now - x.at < r.guard * 60000);
    if (r.guard > 0 && dup) return ["waiting for you", "repeat guard", `Same payment as ${dup.id} moments ago.`];
    if (req.amount > r.line) return ["waiting for you", "approval line", `${req.amount} USDG is above your approval line of ${r.line}.`];
    return ["within rules", "within rules", "Passes every check; next it would be simulated on mainnet."];
  }
  function render() {
    const box = $("pg-ledger"); box.innerHTML = "";
    if (!log.length) { box.innerHTML = '<div class="empty">Pick a request on the left. Each one gets a receipt here, with the rule that decided it.</div>'; return; }
    for (const x of log.slice().reverse()) {
      const kind = x.status === "within rules" ? "sent" : x.status === "waiting for you" ? "wait" : "stop";
      const el = document.createElement("div"); el.className = "receipt " + kind;
      el.innerHTML = `<span class="who"></span><span class="amt"></span><span class="why"><span class="pill"></span>&nbsp; <span class="w"></span></span><span class="meta"></span>`;
      el.querySelector(".who").textContent = x.payee; el.querySelector(".amt").textContent = x.amount.toFixed(2) + " USDG";
      el.querySelector(".pill").textContent = x.status; el.querySelector(".w").textContent = x.reason; el.querySelector(".meta").textContent = `${x.id} · ${x.rule} · “${x.memo}”`;
      box.append(el);
    }
    const spent = log.filter((x) => x.status === "within rules").reduce((a, x) => a + x.amount, 0);
    $("pg-sum").textContent = `${spent.toFixed(2)} of ${R().daily} USDG used · ${log.filter((x) => x.status === "waiting for you").length} waiting · ${log.filter((x) => x.status === "blocked").length} blocked`;
  }
  document.querySelectorAll("[data-req]").forEach((b) => b.addEventListener("click", () => {
    const [payee, amount, memo] = b.dataset.req.split("|");
    const req = { payee, amount: +amount, memo };
    const [status, rule, reason] = decide(req);
    log.push({ ...req, status, rule, reason, id: "RP-" + String(++n).padStart(5, "0"), at: Date.now() });
    render();
  }));
  $("pg-reset").addEventListener("click", () => { log = []; n = 0; render(); $("pg-sum").textContent = ""; });
  render();
})();
