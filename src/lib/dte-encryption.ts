/**
 * AES-256-GCM encryption for DTE-related sensitive data.
 *
 * Supports BOTH strings (passwords) and Buffers (PFX certificates).
 * Requires env var DTE_ENCRYPTION_KEY (32-byte hex string, 64 chars).
 * Generate with: openssl rand -hex 32
 *
 * SECURITY NOTES:
 * - Never log decrypted values.
 * - Decrypt only at the point of use (in-memory) and discard immediately.
 * - Store DTE_ENCRYPTION_KEY in Vercel env vars, never in code.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.DTE_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "DTE_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate with: openssl rand -hex 32"
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a string (e.g. PFX password) → base64 string.
 * Output format: base64(IV || ciphertext || authTag)
 */
export function encryptString(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

/**
 * Decrypt a string previously encrypted with encryptString.
 */
export function decryptString(encrypted: string): string {
  const key = getKey();
  const combined = Buffer.from(encrypted, "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Encrypt a Buffer (e.g. PFX file bytes) → Buffer.
 * Output format: IV || ciphertext || authTag (all in one Buffer for DB storage)
 */
export function encryptBuffer(plaintext: Buffer): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]);
}

/**
 * Decrypt a Buffer previously encrypted with encryptBuffer.
 */
export function decryptBuffer(encrypted: Buffer): Buffer {
  const key = getKey();
  const iv = encrypted.subarray(0, IV_LENGTH);
  const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(IV_LENGTH, encrypted.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
