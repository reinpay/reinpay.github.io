// "Check your rules" on reinpay.app/lab: the lab's scams against the visitor's rules, in the browser, with Reinpay's own
// rules engine (rules.js and labcore.js, copied unchanged from the code). Nothing leaves the page.
import { checkOffline, ANTIDOTE, ROWS } from "./labcore.js";
import { TEMPLATES } from "./templates.js";

const box = document.getElementById("lab-check");
if (box) {
  const $ = (s) => box.querySelector(s), WORD = { paid: "WOULD PAY", held: "HELD", blocked: "BLOCKED", void: "VOID" };
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  function built() {
    const t = $("#ck-tpl").value, r = { ...clean(TEMPLATES[t]?.rules || ROWS.default.rules) };
    if ($("#ck-words").checked) r.memoBlock = ["airdrop", "claim", "verify wallet", "seed phrase", "unlock"]; else delete r.memoBlock;
    const pd = Number($("#ck-perday").value); if (pd > 0) r.maxPerDay = pd; else delete r.maxPerDay;
    if ($("#ck-first").checked) r.firstPayment = "ask"; else delete r.firstPayment;
    return r;
  }
  function pasted() {
    const raw = $("#ck-text").value.trim(); if (!raw) throw new Error("Paste a rules file first, or build rules with the form.");
    let j; try { j = JSON.parse(raw); } catch { throw new Error("That is not JSON. Paste the whole file reinpay rules export wrote."); }
    const r = j?.kind === "reinpay-rules" ? j.rules : j?.rules && typeof j.rules === "object" ? j.rules : j;
    if (!r || typeof r !== "object" || Array.isArray(r)) throw new Error("No rules found in it.");
    return clean(r);
  }
  async function run(useFile) {
    const out = $("#ck-out"), err = $("#ck-err"); err.textContent = "";
    let rules; try { rules = useFile ? pasted() : built(); } catch (e) { err.textContent = e.message; return; }
    const latest = window.LAB_RUN || await (await fetch((document.getElementById("lab-root")?.dataset.base || "/assets/") + "lab/latest.json", { cache: "no-store" })).json();
    const cells = checkOffline(rules, latest.attacks), n = cells.length, stopped = cells.filter((c) => c.outcome !== "paid").length;
    const names = Object.fromEntries(latest.attacks.map((a) => [a.id, a.label]));
    const fixes = [...new Set(cells.filter((c) => c.outcome === "paid").flatMap((c) => ANTIDOTE[c.attack] || []))];
    out.innerHTML = `<p class="ck-score">Your rules stop <b>${stopped === n ? `all ${n}` : `${stopped} of ${n}`}</b> scams.</p>
      <div class="ck-cells">${cells.map((c, i) => `<div class="lab-cell ${c.outcome}"><b class="ck-name">${names[c.attack]}</b><canvas class="lab-mini" width="224" height="160" data-ck="${i}"></canvas><i>${WORD[c.outcome]}</i><span class="ck-why">${c.outcome === "paid" ? "your rules let it through" : c.rule}</span></div>`).join("")}</div>
      ${fixes.length ? `<p class="ck-fix-h">To close the gaps, run these in your own terminal (each one is sealed with your key):</p><div class="cmd"><pre>${fixes.join("\n")}</pre><button class="copy" type="button" data-copy>Copy</button></div>` : `<p class="ck-ok">Nothing got through. Keep the rules sealed, and check again after you change them.</p>`}
      <p class="lab-small">Checked in your browser with Reinpay's own rules engine against the scams of the run at block ${Number(latest.block).toLocaleString("en-US")}. The token check is always on; dollar limits and the mainnet simulation are not run here. Nothing left this page.</p>`;
    out.querySelectorAll("canvas[data-ck]").forEach((cv) => window.ReinpayLabDraw?.mini(cv, cells[+cv.dataset.ck]));
    out.querySelector("[data-copy]")?.addEventListener("click", (e) => { navigator.clipboard?.writeText(fixes.join("\n")); e.target.textContent = "Copied"; setTimeout(() => (e.target.textContent = "Copy"), 1500); });
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  $("#ck-run-form").addEventListener("click", () => run(false));
  $("#ck-run-file").addEventListener("click", () => run(true));
  $("#ck-file").addEventListener("change", async (e) => { const f = e.target.files?.[0]; if (f && f.size < 200000) { $("#ck-text").value = await f.text(); run(true); } });
  box.querySelectorAll("[data-ck-tab]").forEach((b) => b.addEventListener("click", () => { box.querySelectorAll("[data-ck-tab]").forEach((x) => x.classList.toggle("on", x === b)); box.querySelectorAll("[data-ck-pane]").forEach((p) => (p.hidden = p.dataset.ckPane !== b.dataset.ckTab)); }));
}
