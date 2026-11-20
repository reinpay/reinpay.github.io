// The wallet key, encrypted at rest with scrypt + AES-256-GCM. The key never leaves this file or this process.
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { paths, writePrivate } from "./config.js";

const KDF = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const keystoreExists = () => existsSync(paths().keystore);

export function writeKeystore(privateKey, passphrase) {
  if (keystoreExists()) throw new Error(`${paths().keystore} already exists. Reinpay never overwrites a wallet.`);
  if (String(passphrase).length < 10) throw new Error("Use a passphrase of at least 10 characters.");
  const account = privateKeyToAccount(privateKey);
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, KDF);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(privateKey.slice(2), "hex"), c.final()]);
  writePrivate(paths().keystore, JSON.stringify({
    version: 1, address: account.address,
    kdf: { name: "scrypt", ...KDF, salt: salt.toString("hex") },
    cipher: { name: "aes-256-gcm", iv: iv.toString("hex"), tag: c.getAuthTag().toString("hex"), ciphertext: ct.toString("hex") },
  }, null, 2) + "\n");
  return account.address;
}

export function walletAddress() {
  if (!keystoreExists()) return null;
  return JSON.parse(readFileSync(paths().keystore, "utf8")).address;
}

function decrypt(passphrase) {
  const ks = JSON.parse(readFileSync(paths().keystore, "utf8"));
  const { N, r, p, maxmem, salt } = ks.kdf;
  const key = scryptSync(passphrase, Buffer.from(salt, "hex"), 32, { N, r, p, maxmem });
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(ks.cipher.iv, "hex"));
  d.setAuthTag(Buffer.from(ks.cipher.tag, "hex"));
  try {
    return "0x" + Buffer.concat([d.update(Buffer.from(ks.cipher.ciphertext, "hex")), d.final()]).toString("hex");
  } catch {
    throw new Error("Wrong passphrase.");
  }
}

/** Signing account. Uses the passphrase given, or the unlock file written by `reinpay unlock`. */
export function loadAccount(passphrase) {
  if (!keystoreExists()) throw new Error("No Reinpay wallet yet. Run `reinpay init` in your own terminal.");
  const pass = passphrase ?? (isUnlocked() ? readFileSync(paths().passphrase, "utf8").trimEnd() : null);
  if (pass == null) throw new Error("The wallet is locked. Run `reinpay unlock` in your own terminal to let the server sign.");
  return privateKeyToAccount(decrypt(pass));
}

/** Unlocked means the passphrase file exists and its time has not run out. An expired unlock locks itself. */
export function unlockedUntil() {
  if (!existsSync(paths().passphrase)) return null;
  let until = 0;
  try { until = Number(JSON.parse(readFileSync(paths().unlock, "utf8")).until) || 0; } catch { until = 0; }
  return until;
}
export function isUnlocked(now = Date.now()) {
  const u = unlockedUntil();
  if (u === null) return false;
  if (u > 0 && now >= u) { lock(); return false; }
  return true;
}
/** ms: how long the unlock lasts (0 = until reinpay lock). */
export function unlock(passphrase, ms = 0) {
  decrypt(passphrase);
  writePrivate(paths().passphrase, passphrase);
  writePrivate(paths().unlock, JSON.stringify({ until: ms > 0 ? Date.now() + ms : 0 }) + "\n");
}
export function lock() {
  for (const p of [paths().passphrase, paths().unlock]) if (existsSync(p)) unlinkSync(p);
}
export const exportKey = (passphrase) => decrypt(passphrase);
