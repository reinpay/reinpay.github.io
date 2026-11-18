// ---- Fund: send USDG or ETH from a browser wallet to the owner's Reinpay address (Robinhood Chain, 4663) ----
const Fund = (() => {
  const CHAIN = { id: 4663, hex: "0x1237", name: "Robinhood Chain", rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com" };
  const TOKENS = { USDG: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6 }, ETH: { address: null, decimals: 18 } };
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  function parseUnits(s, d) {
    s = String(s || "").trim();
    if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Write the amount as a plain number, like 5 or 0.25.");
    const [w, f = ""] = s.split(".");
    if (f.length > d) throw new Error(`That token has ${d} decimals; the amount has more.`);
    const v = BigInt(w + f.padEnd(d, "0"));
    if (v <= 0n) throw new Error("The amount must be above zero.");
    return v;
  }
  function formatUnits(v, d, max = 6) {
    const neg = v < 0n; if (neg) v = -v;
    const s = v.toString().padStart(d + 1, "0");
    let w = s.slice(0, -d) || "0", f = s.slice(-d).replace(/0+$/, "").slice(0, max);
    return (neg ? "-" : "") + w + (f ? "." + f : "");
  }
  const pad = (hex) => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const transferData = (to, amount) => "0xa9059cbb" + pad(to) + pad(amount.toString(16));
  const balanceData = (who) => "0x70a08231" + pad(who);
  return { CHAIN, TOKENS, isAddr, short, parseUnits, formatUnits, transferData, balanceData };
})();

(() => {
  const $ = (id) => document.getElementById(id);
  const F = Fund, C = F.CHAIN;
  let eth = null, account = null, pending = null;
  const msg = (t, cls = "") => { $("f-msg").textContent = t; $("f-msg").className = "fstatus " + cls; };
  const req = (method, params = []) => eth.request({ method, params });
  function setConnected() {
    const label = account ? F.short(account) : "Connect wallet";
    $("nav-connect").textContent = label;
    $("f-connect").hidden = !!account;
    $("f-check").disabled = !account;
    $("f-wallet").textContent = account ? `Connected ${account} on ${C.name}.` : "No wallet connected.";
    $("f-wallet").className = "fstatus " + (account ? "ok" : "");
  }
  async function ensureChain() {
    const id = await req("eth_chainId");
    if (id.toLowerCase() === C.hex) return;
    try { await req("wallet_switchEthereumChain", [{ chainId: C.hex }]); }
    catch (e) {
      if (e && (e.code === 4902 || /unrecognized|not added|unknown chain/i.test(e.message || ""))) {
        await req("wallet_addEthereumChain", [{ chainId: C.hex, chainName: C.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [C.rpc], blockExplorerUrls: [C.explorer] }]);
      } else throw e;
    }
    if ((await req("eth_chainId")).toLowerCase() !== C.hex) throw new Error(`Your wallet is not on ${C.name}. Switch to it and try again.`);
  }
  async function connect() {
    eth = window.ethereum || null;
    if (!eth) { msg("No browser wallet found. Install MetaMask or OKX Wallet, or open reinpay.app inside your wallet app's browser.", "err"); $("fund").scrollIntoView({ behavior: "smooth" }); return; }
    try {
      [account] = await req("eth_requestAccounts");
      await ensureChain();
      setConnected(); msg(""); showBalance();
      eth.on?.("accountsChanged", (a) => { account = a[0] || null; pending = null; $("f-review").hidden = true; setConnected(); showBalance(); });
      eth.on?.("chainChanged", () => { pending = null; $("f-review").hidden = true; msg("Network changed. Check again before sending.", "warn"); });
    } catch (e) { account = null; setConnected(); msg(e?.code === 4001 ? "Connection cancelled in your wallet." : (e?.message || "Could not connect."), "err"); }
  }
  async function balanceOf(sym, who) {
    const t = F.TOKENS[sym];
    if (!t.address) return BigInt(await req("eth_getBalance", [who, "latest"]));
    return BigInt(await req("eth_call", [{ to: t.address, data: F.balanceData(who) }, "latest"]));
  }
  async function showBalance() {
    if (!account) { $("f-bal").textContent = ""; return; }
    const sym = $("f-token").value;
    try { $("f-bal").textContent = `Your wallet holds ${F.formatUnits(await balanceOf(sym, account), F.TOKENS[sym].decimals)} ${sym}.`; }
    catch { $("f-bal").textContent = ""; }
  }
  async function check() {
    $("f-review").hidden = true; pending = null;
    try {
      if (!account) throw new Error("Connect a wallet first.");
      await ensureChain();
      const to = $("f-to").value.trim(), sym = $("f-token").value, t = F.TOKENS[sym];
      if (!F.isAddr(to)) throw new Error("That is not a 0x address. Run reinpay address in your terminal and paste what it prints.");
      if (to.toLowerCase() === account.toLowerCase()) throw new Error("That is the wallet you are sending from. Paste your Reinpay address instead.");
      if (t.address && to.toLowerCase() === t.address.toLowerCase()) throw new Error("That is the USDG token contract, not a wallet. Tokens sent there are lost.");
      const code = await req("eth_getCode", [to, "latest"]);
      if (code && code !== "0x") throw new Error("That address is a contract. A Reinpay wallet is a plain address; check what you pasted.");
      const amount = F.parseUnits($("f-amount").value, t.decimals);
      const [bal, ethBal, gasPrice] = await Promise.all([balanceOf(sym, account), balanceOf("ETH", account), req("eth_gasPrice").then(BigInt)]);
      if (bal < amount) throw new Error(`Your wallet holds ${F.formatUnits(bal, t.decimals)} ${sym}, less than ${F.formatUnits(amount, t.decimals)} ${sym}.`);
      const tx = t.address ? { from: account, to: t.address, data: F.transferData(to, amount), value: "0x0" } : { from: account, to, value: "0x" + amount.toString(16) };
      // Simulate: a token transfer must return true; every transfer must have a gas estimate.
      if (t.address) {
        const out = await req("eth_call", [tx, "latest"]);
        if (BigInt(out || "0x0") !== 1n) throw new Error("The simulation did not return success for this transfer. Nothing was sent.");
      }
      const gas = BigInt(await req("eth_estimateGas", [tx]));
      const fee = (gas * 12n / 10n) * gasPrice;
      if (ethBal < fee + (t.address ? 0n : amount)) throw new Error(`Not enough ETH for the network fee (about ${F.formatUnits(fee, 18, 8)} ETH).`);
      pending = { tx: { ...tx, gas: "0x" + (gas * 12n / 10n).toString(16) }, sym, amount, to };
      $("f-summary").innerHTML = "";
      const lines = [
        `Send ${F.formatUnits(amount, t.decimals)} ${sym}`,
        `from ${account}`,
        `to   ${to} (your Reinpay wallet)`,
        `on   ${C.name}, chain id ${C.id}`,
        `fee  about ${F.formatUnits(fee, 18, 8)} ETH`,
        `Simulated just now: the transfer succeeds. Your wallet asks you to sign next.`,
      ];
      for (const l of lines) { const d = document.createElement("div"); d.className = "line"; d.textContent = l; $("f-summary").append(d); }
      $("f-review").hidden = false; msg("");
    } catch (e) { msg(e?.message || "Could not check this transfer.", "err"); }
  }
  async function send() {
    if (!pending) return;
    $("f-send").disabled = true;
    try {
      await ensureChain();
      msg("Confirm the transaction in your wallet.", "warn");
      const hash = await req("eth_sendTransaction", [pending.tx]);
      $("f-review").hidden = true;
      const link = `${C.explorer}/tx/${hash}`;
      $("f-msg").className = "fstatus warn"; $("f-msg").innerHTML = "";
      $("f-msg").append("Sent. Waiting for Robinhood Chain to confirm… ");
      const a = document.createElement("a"); a.href = link; a.target = "_blank"; a.rel = "noopener"; a.textContent = "View on explorer"; $("f-msg").append(a);
      for (let i = 0; i < 90; i++) {
        const r = await req("eth_getTransactionReceipt", [hash]).catch(() => null);
        if (r) {
          $("f-msg").firstChild.textContent = r.status === "0x1" ? `Confirmed in block ${parseInt(r.blockNumber, 16)}. Your Reinpay wallet received ${F.formatUnits(pending.amount, F.TOKENS[pending.sym].decimals)} ${pending.sym}. ` : "The transaction failed on chain; only the network fee was paid. ";
          $("f-msg").className = "fstatus " + (r.status === "0x1" ? "ok" : "err");
          break;
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
      pending = null; showBalance();
    } catch (e) { msg(e?.code === 4001 ? "You rejected it in your wallet. Nothing was sent." : (e?.message || "The wallet did not send it."), "err"); }
    finally { $("f-send").disabled = false; }
  }
  $("nav-connect").addEventListener("click", () => { if (!account) connect(); else location.hash = "fund"; });
  $("f-connect").addEventListener("click", connect);
  $("f-check").addEventListener("click", check);
  $("f-send").addEventListener("click", send);
  $("f-cancel").addEventListener("click", () => { pending = null; $("f-review").hidden = true; });
  $("f-token").addEventListener("change", () => { pending = null; $("f-review").hidden = true; showBalance(); });
  for (const id of ["f-to", "f-amount"]) $(id).addEventListener("input", () => { if (pending) { pending = null; $("f-review").hidden = true; } });
  setConnected();
})();
