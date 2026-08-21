import { randomBytes } from "crypto";

/** 32 bytes aleatorios en base64url. Único global; no loguear el valor completo. */
export function generateReportToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateFollowToken(): string {
  return randomBytes(24).toString("base64url");
}

export function truncateToken(token: string): string {
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export function sanitizeUploadFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "archivo";
  const cleaned = base
    .replace(/[^\w.\-áéíóúÁÉÍÓÚñÑ ]+/g, "_")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || "archivo";
}
