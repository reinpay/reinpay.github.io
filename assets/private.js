// reinpay.app/private: a concept preview. The flow below is an illustration with pretend numbers; nothing is deposited,
// shielded, signed or sent from this page.
(() => {
  const box = document.getElementById("pv"); if (!box) return;
  const $ = (id) => document.getElementById(id), RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const steps = [...box.querySelectorAll(".pv-step")], lines = $("pv-log");
  const S = { pub: 50, priv: 0, sent: 0 };
  const hex = () => "0x" + [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("") + "…" + [...crypto.getRandomValues(new Uint8Array(2))].map((b) => b.toString(16).padStart(2, "0")).join("");
  function show() { $("pv-pub").textContent = S.pub.toFixed(2); $("pv-priv").textContent = S.priv.toFixed(2); $("pv-sent").textContent = S.sent.toFixed(2); }
  function log(cls, t) { const d = document.createElement("div"); d.className = "pv-l " + cls; d.textContent = t; lines.appendChild(d); while (lines.children.length > 10) lines.firstChild.remove(); }
  function on(i) { steps.forEach((s, k) => s.classList.toggle("on", k === i)); }
  const wait = (ms) => new Promise((r) => setTimeout(r, RM ? 0 : ms));
  let busy = false;
  async function shield() { if (busy || S.pub < 20) return; busy = true; on(0); log("dim", "> shield 20 USDG"); await wait(700); log("dim", "  commitment " + hex() + " added to the pool"); await wait(600); S.pub -= 20; S.priv += 20; show(); log("ok", "  private balance: " + S.priv.toFixed(2) + " USDG · visible only to you"); busy = false; }
  async function pay() { if (busy || S.priv < 4) return; busy = true; on(1); const to = $("pv-to").value; log("dim", `> private pay 4 USDG to "${to}"`); await wait(600);
    if (to === "0x9f3c…e21a (unknown)") { log("bad", "  reins: payee list · not on your list. Blocked before any proof is made."); on(-1); busy = false; return; }
    log("dim", "  reins: payee list ✓ · budget ✓ · your line ✓"); await wait(600); log("dim", "  proof " + hex() + " · relayed, your wallet not shown"); await wait(600); S.priv -= 4; S.sent += 4; show(); log("ok", `  ${to} received 4 USDG · receipt kept on your computer`); busy = false; }
  async function prove() { if (busy) return; busy = true; on(2); log("dim", "> clean proof"); await wait(700); log("dim", "  your deposits are in the set that excludes blocked addresses"); await wait(600); log("ok", "  proof " + hex() + " · shows the funds are clean, not which deposits are yours"); busy = false; }
  $("pv-shield").onclick = shield; $("pv-pay").onclick = pay; $("pv-prove").onclick = prove;
  $("pv-reset").onclick = () => { S.pub = 50; S.priv = 0; S.sent = 0; show(); lines.innerHTML = ""; on(-1); log("dim", "> pretend wallet: 50 USDG public, nothing private yet"); };
  show(); log("dim", "> pretend wallet: 50 USDG public, nothing private yet");
})();
