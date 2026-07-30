/**
 * Resolución compartida de firma para envío.
 * Orden: default personal → default empresa (userId: null) → null.
 * NUNCA consultar por isDefault sin condición de userId.
 *
 * Si content es estructurado, se re-renderiza (htmlContent puede estar stale
 * tras migraciones o ediciones parciales). Legacy usa htmlContent tal cual.
 */

import { prisma } from "@/lib/prisma";
import { isStructuredSignature } from "./signature-data";
import { renderSignatureHtml } from "./signature-render";

export type ResolvedSignature = {
  id: string;
  html: string;
};

function htmlFromRow(row: {
  id: string;
  content: unknown;
  htmlContent: string | null;
}): ResolvedSignature | null {
  if (isStructuredSignature(row.content)) {
    return { id: row.id, html: renderSignatureHtml(row.content) };
  }
  if (row.htmlContent?.trim()) {
    return { id: row.id, html: row.htmlContent };
  }
  return null;
}

/**
 * @param userId — si se omite o es null/undefined, solo busca firma de empresa.
 */
export async function resolveSignatureForSend(
  tenantId: string,
  userId?: string | null,
): Promise<ResolvedSignature | null> {
  try {
    if (userId) {
      const own = await prisma.crmEmailSignature.findFirst({
        where: { tenantId, userId, isDefault: true, isActive: true },
        orderBy: { updatedAt: "desc" },
      });
      if (own) {
        const resolved = htmlFromRow(own);
        if (resolved) return resolved;
      }
    }

    const company = await prisma.crmEmailSignature.findFirst({
      where: { tenantId, userId: null, isDefault: true, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    if (company) {
      return htmlFromRow(company);
    }

    return null;
  } catch (error) {
    console.error("[signatures] Error resolviendo firma:", error);
    return null;
  }
}
