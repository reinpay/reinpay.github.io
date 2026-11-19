// The spend lock, offline: one holder at a time, stale locks from dead processes are cleared, and a held lock times out cleanly.
import { mkdtempSync, writeFileSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
process.env.REINPAY_HOME = mkdtempSync(join(tmpdir(), "reinpay-lock-"));
const { withLock, lockPath, clearStale } = await import("../src/lock.js");

let pass = 0, fail = 0;
const check = (label, cond, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${label}${info ? ` (${info})` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// two holders in one process never overlap
let inside = 0, overlap = false; const order = [];
await Promise.all([1, 2, 3].map((i) => withLock(async () => { inside++; if (inside > 1) overlap = true; order.push(i); await sleep(60); inside--; })));
check("three concurrent holders run one at a time", !overlap && order.length === 3, order.join(","));
check("the lock file is gone afterwards", !existsSync(lockPath()));
// a thrown error still releases
let threw = false;
try { await withLock(async () => { throw new Error("boom"); }); } catch (e) { threw = e.message === "boom"; }
check("an error inside passes through and releases the lock", threw && !existsSync(lockPath()));
// across processes: a child holds the lock for 700 ms; we must wait for it
const child = spawn(process.execPath, ["--input-type=module", "-e", `const { withLock } = await import(${JSON.stringify(new URL("../src/lock.js", import.meta.url).href)}); await withLock(async () => { console.log("held"); await new Promise((r) => setTimeout(r, 700)); });`], { env: process.env, stdio: ["ignore", "pipe", "inherit"] });
const exited = new Promise((r) => child.once("exit", r));
await new Promise((r) => child.stdout.once("data", r));
const t0 = Date.now(); await withLock(async () => {}); const waited = Date.now() - t0;
check("a second process waits for the first one to finish", waited >= 400, `${waited} ms`);
await exited;
// stale: a lock left by a process that no longer exists is cleared
writeFileSync(lockPath(), JSON.stringify({ pid: 2 ** 22 + 12345, at: Date.now() }));
check("a lock from a dead process is cleared", clearStale() && !existsSync(lockPath()));
writeFileSync(lockPath(), JSON.stringify({ pid: process.pid, at: Date.now() }));
const old = (Date.now() - 5 * 60_000) / 1000; utimesSync(lockPath(), old, old);
check("a lock older than 2 minutes is cleared even if the pid is alive", clearStale() && !existsSync(lockPath()));
// held by a live process and fresh: give up after the wait, with a plain message
writeFileSync(lockPath(), JSON.stringify({ pid: process.pid, at: Date.now() }));
let msg = ""; try { await withLock(async () => {}, { waitMs: 300 }); } catch (e) { msg = e.message; }
check("a fresh lock held by a live process times out with a plain reason", /Another Reinpay process/.test(msg), msg);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
