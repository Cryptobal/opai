/**
 * Resolución compartida de firma para envío.
 * Orden: default personal → default empresa (userId: null) → null.
 * NUNCA consultar por isDefault sin condición de userId.
 */

import { prisma } from "@/lib/prisma";

export type ResolvedSignature = {
  id: string;
  html: string;
};

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
      if (own?.htmlContent) {
        return { id: own.id, html: own.htmlContent };
      }
    }

    const company = await prisma.crmEmailSignature.findFirst({
      where: { tenantId, userId: null, isDefault: true, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    if (company?.htmlContent) {
      return { id: company.id, html: company.htmlContent };
    }

    return null;
  } catch (error) {
    console.error("[signatures] Error resolviendo firma:", error);
    return null;
  }
}
