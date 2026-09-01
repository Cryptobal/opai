import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** Alfabeto sin ambigüedad (sin I, O, 0, 1). */
export const DT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DT_CODE_LENGTH = 10;
export const DT_CODE_TTL_MS = 5 * 24 * 60 * 60 * 1000;

export function generateDtAccessCode(length = DT_CODE_LENGTH): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += DT_CODE_ALPHABET[bytes[i]! % DT_CODE_ALPHABET.length];
  }
  return code;
}

export function hashDtAccessCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase(), "utf8").digest("hex");
}

export function dtCodeExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + DT_CODE_TTL_MS);
}

export function isDtCodeExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function timingSafeHashEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
