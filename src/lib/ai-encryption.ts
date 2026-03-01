/**
 * AES-256-GCM encryption for AI provider API keys.
 *
 * Requires env var AI_ENCRYPTION_KEY (32-byte hex string, 64 chars).
 * Generate with: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.AI_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "AI_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate with: openssl rand -hex 32"
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plain-text API key.
 * Returns a base64 string containing IV + ciphertext + auth tag.
 */
export function encryptApiKey(plainKey: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString("base64");
}

/**
 * Decrypts an API key previously encrypted with `encryptApiKey`.
 */
export function decryptApiKey(encryptedKey: string): string {
  const key = getKey();
  const combined = Buffer.from(encryptedKey, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(
    IV_LENGTH,
    combined.length - AUTH_TAG_LENGTH
  );

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Masks an API key for display: shows first 8 and last 4 chars.
 * Example: "sk-ant-api03-abc...WXYZ"
 */
export function maskApiKey(plainKey: string): string {
  if (plainKey.length <= 12) return "••••••••";
  const prefix = plainKey.slice(0, 8);
  const suffix = plainKey.slice(-4);
  return `${prefix}...${suffix}`;
}
