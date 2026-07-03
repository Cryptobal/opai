/**
 * Servidor MCP (Fase 3) — generación y resolución de API keys.
 *
 * La key es la única fuente del tenant. Formato: `opai_mcp_` + 40 chars
 * base62 aleatorios. Nunca se persiste en claro: solo su sha256 (keyHash)
 * y el prefijo visible (keyPrefix, primeros 12 chars) para identificarla.
 */

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const MCP_KEY_PREFIX = "opai_mcp_";
const RANDOM_LEN = 40;
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; // 62 chars

export type McpScope = "READ" | "READ_WRITE";

export interface ResolvedMcpKey {
  keyId: string;
  tenantId: string;
  scope: McpScope;
  adminId: string;
}

/** sha256 hex de la key en claro. Determinístico → sirve de lookup. */
export function hashMcpKey(plainKey: string): string {
  return createHash("sha256").update(plainKey).digest("hex");
}

/** Genera `len` chars base62 uniformes (rejection sampling, sin sesgo módulo). */
function base62(len: number): string {
  let out = "";
  while (out.length < len) {
    for (const b of randomBytes(len)) {
      if (out.length >= len) break;
      if (b < 248) out += ALPHABET[b % 62]; // descarta 248-255 para uniformidad
    }
  }
  return out;
}

export function generateMcpKey(): {
  plainKey: string;
  keyHash: string;
  keyPrefix: string;
} {
  const plainKey = MCP_KEY_PREFIX + base62(RANDOM_LEN);
  return {
    plainKey,
    keyHash: hashMcpKey(plainKey),
    keyPrefix: plainKey.slice(0, 12),
  };
}

/**
 * Carga la key activa (no revocada) por hash. Devuelve el tenant, scope y el
 * Admin creador (identidad de ejecución) o `null` si no existe / está revocada.
 */
export async function resolveMcpKey(
  plainKey: string | null | undefined,
): Promise<ResolvedMcpKey | null> {
  if (!plainKey || !plainKey.startsWith(MCP_KEY_PREFIX)) return null;

  const key = await prisma.mcpApiKey.findUnique({
    where: { keyHash: hashMcpKey(plainKey) },
    select: {
      id: true,
      tenantId: true,
      scope: true,
      createdByAdminId: true,
      revokedAt: true,
    },
  });

  if (!key || key.revokedAt) return null;

  return {
    keyId: key.id,
    tenantId: key.tenantId,
    scope: key.scope === "READ_WRITE" ? "READ_WRITE" : "READ",
    adminId: key.createdByAdminId,
  };
}

/** Marca la key como usada. Best-effort: nunca bloquea ni lanza. */
export async function touchLastUsed(keyId: string): Promise<void> {
  try {
    await prisma.mcpApiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: new Date() },
    });
  } catch (error) {
    console.error("[mcp] touchLastUsed failed", error);
  }
}
