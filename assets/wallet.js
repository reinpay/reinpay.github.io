// Connect wallet, on every page: reads your browser wallet's address on Robinhood Chain and its balances.
// It never asks for a signature; funding happens on the App page, simulated first, and your wallet asks you there.
(() => {
  const btn = document.getElementById("nav-wallet"); if (!btn) return;
  const C = { hex: "0x1237", name: "Robinhood Chain", rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com" };
  const T = [["ETH", null, 18], ["USDG", "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", 6], ["REINPAY", btn.dataset.ca, 18]];
  const base = btn.dataset.base || "/";
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  const units = (v, d, m = 4) => { const s = v.toString().padStart(d + 1, "0"), i = s.slice(0, s.length - d), f = s.slice(s.length - d).replace(/0+$/, "").slice(0, m); return BigInt(i).toLocaleString("en-US") + (f ? "." + f : ""); };
  let eth = null, account = null, panel = null;
  const req = (method, params = []) => eth.request({ method, params });
  async function rpc(calls) { const r = await fetch(C.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map(([m, p], i) => ({ jsonrpc: "2.0", id: i + 1, method: m, params: p }))) }); const j = await r.json(); const by = Object.fromEntries(j.map((x) => [x.id, x.result])); return calls.map((_, i) => by[i + 1]); }
  async function ensureChain() {
    if ((await req("eth_chainId")).toLowerCase() === C.hex) return;
    try { await req("wallet_switchEthereumChain", [{ chainId: C.hex }]); }
    catch (e) { if (e && (e.code === 4902 || /unrecognized|not added|unknown chain/i.test(e.message || ""))) await req("wallet_addEthereumChain", [{ chainId: C.hex, chainName: C.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [C.rpc], blockExplorerUrls: [C.explorer] }]); else throw e; }
  }
  function close() { panel?.remove(); panel = null; }
  async function open() {
    close(); panel = document.createElement("div"); panel.className = "wl-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Connected wallet");
    panel.innerHTML = `<div class="wl-h"><span>CONNECTED · ${C.name.toUpperCase()}</span><button type="button" class="wl-x" aria-label="Close">×</button></div><div class="wl-a"><code>${account}</code><button type="button" class="copy wl-c">Copy</button></div><div class="wl-b" id="wl-b"><span class="dim">Reading balances…</span></div>
      <div class="wl-l"><a class="btn" href="${base}app/#fund">Fund your agent →</a><a class="btn ghost" href="${base}scan/?q=${account}">Scan this address</a><a class="btn ghost" href="${C.explorer}/address/${account}" target="_blank" rel="noopener">Explorer ↗</a></div>
      <p class="wl-n">Read only. Reinpay never asks for a signature here. To disconnect, remove reinpay.app from your wallet's connected sites.</p>`;
    document.body.appendChild(panel);
    panel.querySelector(".wl-x").onclick = close;
    panel.querySelector(".wl-c").onclick = async (e) => { try { await navigator.clipboard.writeText(account); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select it"; } };
    try {
      const w = account.slice(2).toLowerCase().padStart(64, "0");
      const r = await rpc(T.map(([, a]) => (a ? ["eth_call", [{ to: a, data: "0x70a08231" + w }, "latest"]] : ["eth_getBalance", [account, "latest"]])));
      const el = panel?.querySelector("#wl-b"); if (el) el.innerHTML = T.map(([s, , d], i) => `<div><span>${s}</span><b>${units(BigInt(r[i] || "0x0"), d, s === "REINPAY" ? 2 : 4)}</b></div>`).join("");
    } catch { const el = panel?.querySelector("#wl-b"); if (el) el.innerHTML = '<span class="dim">Balances could not be read right now.</span>'; }
  }
  function show() { btn.textContent = account ? "● " + short(account) : "Connect wallet"; btn.classList.toggle("on", !!account); }
  async function connect() {
    eth = window.ethereum || null;
    if (!eth) { btn.textContent = "No wallet found"; setTimeout(show, 2500); return; }
    try { [account] = await req("eth_requestAccounts"); await ensureChain(); show(); open(); }
    catch (e) { account = null; show(); btn.textContent = e?.code === 4001 ? "Cancelled" : "Could not connect"; setTimeout(show, 2500); }
  }
  btn.addEventListener("click", () => (account ? (panel ? close() : open()) : connect()));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  document.addEventListener("click", (e) => { if (panel && !panel.contains(e.target) && e.target !== btn) close(); });
  // already connected before? show the address without asking again
  if (window.ethereum) { eth = window.ethereum; eth.request({ method: "eth_accounts" }).then((a) => { account = a?.[0] || null; show(); }).catch(() => {}); eth.on?.("accountsChanged", (a) => { account = a?.[0] || null; close(); show(); }); }
})();
