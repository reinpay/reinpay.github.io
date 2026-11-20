// Keeps the Reinpay Lab record: assets/lab/runs/*.json (one per hour), the newest also as assets/lab/latest.json,
// and assets/lab/index.json listing the last 168 runs (a week) with their totals and a compact grid. Older runs are removed.
import { readdirSync, readFileSync, writeFileSync, unlinkSync, copyFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2] || "assets/lab", runs = join(dir, "runs"), KEEP = 168;
const files = readdirSync(runs).filter((f) => /^\d{8}T\d{4}Z\.json$/.test(f)).sort();
for (const f of files.slice(0, Math.max(0, files.length - KEEP))) unlinkSync(join(runs, f));
const kept = files.slice(-KEEP), list = [];
for (const f of kept) {
  let r; try { r = JSON.parse(readFileSync(join(runs, f), "utf8")); } catch { continue; }
  if (r.kind !== "reinpay-lab-run") continue;
  const grid = r.rows.map((row) => r.attacks.map((a) => (r.cells.find((c) => c.row === row.id && c.attack === a.id)?.outcome || "void")[0]).join("")).join("|");
  list.push({ file: f, at: r.at, block: r.block, totals: r.totals, grid, sha256: r.sha256 });
}
list.reverse();
writeFileSync(join(dir, "index.json"), JSON.stringify({ kind: "reinpay-lab-index", version: 1, updated: new Date().toISOString(), runs: list }, null, 1) + "\n");
if (list.length) copyFileSync(join(runs, list[0].file), join(dir, "latest.json"));
console.log(`index: ${list.length} runs, latest ${list[0]?.file || "none"}`);
