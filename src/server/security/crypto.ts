import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Application-level encryption for secrets stored at rest (GitHub OAuth tokens,
 * Slack webhook URLs, per-repo webhook secrets).
 *
 * Uses AES-256-GCM with a key derived from AUTH_SECRET via scrypt. This is
 * defence-in-depth on top of Neon's at-rest encryption: a leaked DB dump does
 * not reveal usable tokens without the app secret.
 *
 * Format (base64): [16-byte salt][12-byte iv][16-byte auth tag][ciphertext]
 */

const ALGO = "aes-256-gcm";

function deriveKey(salt: Buffer): Buffer {
  // scryptSync is deterministic given the same secret+salt.
  return crypto.scryptSync(env.AUTH_SECRET, salt, 32);
}

export function encryptSecret(plaintext: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(salt);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const salt = buf.subarray(0, 16);
  const iv = buf.subarray(16, 28);
  const tag = buf.subarray(28, 44);
  const ciphertext = buf.subarray(44);
  const key = deriveKey(salt);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Generate a cryptographically strong hex secret (default 32 bytes). */
export function generateSecret(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}
