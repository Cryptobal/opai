import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Secreto para cifrar/descifrar tokens OAuth de Gmail. Fail-closed: sin
 * `GMAIL_TOKEN_SECRET` definido se lanza error en vez de caer a un valor por
 * defecto (los tests deben setear la env). Nunca imprime el valor.
 *
 * Retorna el valor CRUDO (sin trim): los tokens ya persistidos se cifraron
 * con el valor exacto de la env, y un trim cambiaría la clave AES derivada.
 */
export function getGmailTokenSecret(): string {
  const secret = process.env.GMAIL_TOKEN_SECRET;
  if (!secret?.trim()) {
    throw new Error(
      "GMAIL_TOKEN_SECRET no está definido. Configura esta variable de entorno para el cifrado de tokens de Gmail.",
    );
  }
  return secret;
}

function getKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function encryptText(plainText: string, secret: string): string {
  const key = getKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptText(payload: string, secret: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const key = getKey(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
