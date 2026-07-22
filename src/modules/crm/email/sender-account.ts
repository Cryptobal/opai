import { prisma } from "@/lib/prisma";
import type { CrmEmailAccount } from "@prisma/client";

export type SenderAccountResult =
  | { ok: true; account: CrmEmailAccount }
  | { ok: false; status: number; error: string };

/**
 * Resuelve la casilla remitente para /api/crm/gmail/send (B1).
 *
 * - Reply (`threadId`): la casilla es SIEMPRE la dueña del hilo — nunca la
 *   primera del usuario (con ≥2 casillas conectadas el findFirst anterior
 *   respondía desde la casilla equivocada). Se valida tenant + ownership.
 * - Composición nueva: `emailAccountId` explícito validado contra el usuario
 *   de sesión; con una sola casilla conectada se usa como default; con varias
 *   y sin selección explícita se rechaza (la UI muestra el selector).
 */
export async function resolveSenderAccount(params: {
  tenantId: string;
  userId: string;
  threadId?: string | null;
  emailAccountId?: string | null;
}): Promise<SenderAccountResult> {
  const { tenantId, userId } = params;

  if (typeof params.threadId === "string" && params.threadId) {
    const thread = await prisma.crmEmailThread.findFirst({
      where: { id: params.threadId, tenantId },
      select: { id: true, emailAccountId: true },
    });
    if (!thread) {
      return { ok: false, status: 404, error: "Hilo no encontrado" };
    }
    if (!thread.emailAccountId) {
      return { ok: false, status: 400, error: "El hilo no tiene casilla asociada" };
    }
    const account = await prisma.crmEmailAccount.findFirst({
      where: {
        id: thread.emailAccountId,
        tenantId,
        provider: "gmail",
        status: "active",
      },
    });
    if (!account) {
      return { ok: false, status: 400, error: "La casilla del hilo no está conectada" };
    }
    if (account.userId !== userId) {
      return {
        ok: false,
        status: 403,
        error: "El hilo pertenece a la casilla de otro usuario",
      };
    }
    return { ok: true, account };
  }

  if (typeof params.emailAccountId === "string" && params.emailAccountId) {
    const account = await prisma.crmEmailAccount.findFirst({
      where: {
        id: params.emailAccountId,
        tenantId,
        userId,
        provider: "gmail",
        status: "active",
      },
    });
    if (!account) {
      return { ok: false, status: 403, error: "Casilla remitente inválida" };
    }
    return { ok: true, account };
  }

  const accounts = await prisma.crmEmailAccount.findMany({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  if (accounts.length === 0) {
    return { ok: false, status: 400, error: "Gmail no conectado" };
  }
  if (accounts.length > 1) {
    return {
      ok: false,
      status: 400,
      error: "Tenés más de una casilla conectada: indicá la casilla remitente",
    };
  }
  return { ok: true, account: accounts[0] };
}
