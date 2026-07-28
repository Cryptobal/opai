/**
 * Resolución persistida del estilo de respuesta IA (servidor / Prisma).
 */
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_CORREO_AI_STYLE,
  parseCorreoAiStyle,
  type CorreoAiStyle,
} from "./correo-ai-style";

function rowToStyle(row: {
  closeness: string;
  addressing: string;
  length: string;
  avoidWords: string[];
  guidance: string | null;
}): CorreoAiStyle {
  return parseCorreoAiStyle(row);
}

/** Personal → tenant → default. Mismo patrón que resolveDefaultSignature. */
export async function resolveCorreoAiStyle(
  tenantId: string,
  userId: string,
): Promise<CorreoAiStyle> {
  try {
    const own = await prisma.crmEmailAiStyle.findFirst({
      where: { tenantId, userId },
    });
    if (own) return rowToStyle(own);
    const tenant = await prisma.crmEmailAiStyle.findFirst({
      where: { tenantId, userId: null },
    });
    if (tenant) return rowToStyle(tenant);
  } catch (error) {
    console.error("[correos] Error cargando estilo IA:", error);
  }
  return { ...DEFAULT_CORREO_AI_STYLE };
}

export async function loadCorreoAiStyleScope(
  tenantId: string,
  userId: string,
  scope: "user" | "tenant",
): Promise<CorreoAiStyle | null> {
  const row = await prisma.crmEmailAiStyle.findFirst({
    where:
      scope === "user"
        ? { tenantId, userId }
        : { tenantId, userId: null },
  });
  return row ? rowToStyle(row) : null;
}
