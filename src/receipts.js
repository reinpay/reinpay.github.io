// Receipts: one record per payment request, whatever the outcome. Kept in ~/.reinpay/receipts.json.
import { existsSync, readFileSync } from "node:fs";
import { paths, writePrivate } from "./config.js";

function load() {
  const p = paths().receipts;
  if (!existsSync(p)) return { seq: 0, receipts: [] };
  try { return JSON.parse(readFileSync(p, "utf8")); }
  catch { throw new Error(`${p} is not valid JSON. Reinpay will not overwrite your receipts; fix or move the file.`); }
}
const save = (db) => writePrivate(paths().receipts, JSON.stringify(db, null, 1) + "\n");

export const allReceipts = () => load().receipts;
export const getReceipt = (id) => load().receipts.find((r) => r.id === String(id).toUpperCase()) || null;

export function addReceipt(fields) {
  const db = load();
  const r = { id: "RP-" + String(++db.seq).padStart(5, "0"), createdAt: Date.now(), history: [], ...fields };
  db.receipts.push(r);
  save(db);
  return r;
}

export function updateReceipt(id, patch, note) {
  const db = load();
  const r = db.receipts.find((x) => x.id === id);
  if (!r) throw new Error(`No receipt ${id}.`);
  Object.assign(r, patch);
  if (note) r.history.push({ at: Date.now(), note });
  save(db);
  return r;
}

/** Public view: what the agent and the owner see. Prepared transaction data stays internal. */
export function view(r) {
  const { tx, _tx, ...rest } = r;
  return { ...rest, createdAt: new Date(r.createdAt).toISOString(), history: r.history.map((h) => ({ at: new Date(h.at).toISOString(), note: h.note })) };
}

/** Owner only: remove a receipt's memo for good, keeping a note that it was redacted. */
export function redactMemo(id, why = "") {
  const db = load();
  const r = db.receipts.find((x) => x.id === String(id).toUpperCase());
  if (!r) throw new Error(`No receipt ${id}.`);
  if (r.memo === "[redacted]") return r;
  r.memo = "[redacted]";
  r.history.push({ at: Date.now(), note: `Memo redacted by the owner${why ? `: ${String(why).slice(0, 80)}` : ""}.` });
  save(db);
  return r;
}
