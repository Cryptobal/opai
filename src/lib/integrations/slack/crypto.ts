/**
 * Cifrado de tokens de bot de Slack.
 *
 * Reutiliza el AES-256-GCM de `src/lib/crypto.ts` con la clave dedicada
 * `SLACK_TOKEN_ENCRYPTION_KEY`. No duplica la primitiva criptográfica.
 */

import { encryptText, decryptText } from "@/lib/crypto";

function getSecret(): string {
  const secret = process.env.SLACK_TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "[slack] SLACK_TOKEN_ENCRYPTION_KEY must be set (>= 16 chars) to encrypt bot tokens",
    );
  }
  return secret;
}

export function encryptSlackToken(token: string): string {
  return encryptText(token, getSecret());
}

export function decryptSlackToken(payload: string): string {
  return decryptText(payload, getSecret());
}
