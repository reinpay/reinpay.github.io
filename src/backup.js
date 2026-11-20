// Backup and restore, to move a wallet to another computer. The backup holds the keystore exactly as it is on disk
// (still encrypted with your passphrase), plus the config, the receipts and a freeze if there is one. It never holds the
// passphrase file. Restore refuses to overwrite a wallet, checks the file's hash, and then checks the config seal.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { getAddress } from "viem";
import { paths, writePrivate } from "./config.js";
import { freezePath } from "./freeze.js";
import { checkSeal } from "./seal.js";

const sha = (s) => createHash("sha256").update(s).digest("hex");
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

/** The backup object for the current wallet (or profile). */
export function makeBackup(now = Date.now()) {
  const P = paths();
  const keystore = readJson(P.keystore);
  if (!keystore) throw new Error("No wallet here to back up.");
  const payload = { keystore, config: readJson(P.config), receipts: readJson(P.receipts), frozen: readJson(freezePath()) };
  const body = JSON.stringify(payload);
  return { kind: "reinpay-backup", version: 1, createdAt: new Date(now).toISOString(), address: getAddress(keystore.address), sha256: sha(body), payload };
}

/** Restore into the current home (or profile). Returns { address, receipts, seal }. */
export async function restoreBackup(b) {
  if (b?.kind !== "reinpay-backup" || b.version !== 1 || !b.payload?.keystore) throw new Error("This is not a Reinpay backup (v1).");
  if (sha(JSON.stringify(b.payload)) !== b.sha256) throw new Error("The backup's hash does not match its contents. It was changed or damaged; nothing was restored.");
  const ks = b.payload.keystore;
  if (!ks.address || getAddress(ks.address) !== getAddress(b.address) || ks.cipher?.name !== "aes-256-gcm" || ks.kdf?.name !== "scrypt") throw new Error("The keystore inside the backup does not look right; nothing was restored.");
  const P = paths();
  if (existsSync(P.keystore)) throw new Error(`A wallet already exists here (${P.keystore}). Restore into an empty profile instead, e.g. --profile=restored.`);
  writePrivate(P.keystore, JSON.stringify(ks, null, 2) + "\n");
  if (b.payload.config) writePrivate(P.config, JSON.stringify(b.payload.config, null, 2) + "\n");
  if (b.payload.receipts) writePrivate(P.receipts, JSON.stringify(b.payload.receipts, null, 1) + "\n");
  if (b.payload.frozen) writePrivate(freezePath(), JSON.stringify(b.payload.frozen, null, 1) + "\n");
  const seal = b.payload.config ? await checkSeal(b.payload.config, ks.address) : { ok: false, reason: "no config in the backup" };
  return { address: getAddress(ks.address), receipts: b.payload.receipts?.receipts?.length || 0, frozen: !!b.payload.frozen, seal };
}
