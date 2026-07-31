/**
 * Integridad hilo ↔ cuenta ↔ negocio.
 *
 * Un negocio siempre pertenece a una cuenta. Si el hilo apunta a una cuenta
 * distinta de la del negocio, la fuente de verdad es el negocio (la cuenta
 * del hilo suele quedar contaminada con la propia empresa — p. ej. "Gard
 * Security" — por reutilización cruzada en create-structure).
 */
import { prisma } from "@/lib/prisma";

export type ThreadAccountDealIds = {
  accountId: string | null;
  dealId: string | null;
};

/**
 * Si hay deal y su accountId difiere del del hilo, alinea el hilo al account
 * del deal. No-op si no hay deal, el deal no existe o ya coinciden.
 */
export async function healThreadAccountToDealAccount(params: {
  tenantId: string;
  threadId: string;
  accountId: string | null;
  dealId: string | null;
}): Promise<ThreadAccountDealIds> {
  const { tenantId, threadId, accountId, dealId } = params;
  if (!dealId) return { accountId, dealId };

  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { id: true, accountId: true },
  });
  if (!deal) {
    // Deal huérfano: limpiar referencia del hilo.
    if (dealId) {
      await prisma.crmEmailThread.update({
        where: { id: threadId },
        data: { dealId: null },
      });
    }
    return { accountId, dealId: null };
  }

  if (deal.accountId === accountId) {
    return { accountId, dealId };
  }

  await prisma.crmEmailThread.update({
    where: { id: threadId },
    data: { accountId: deal.accountId },
  });

  return { accountId: deal.accountId, dealId };
}
