/**
 * Integridad hilo ↔ cuenta ↔ negocio.
 *
 * - Un negocio siempre pertenece a una cuenta: si difieren, gana el deal.
 * - Ningún hilo debe quedar asociado a la cuenta de la propia empresa del
 *   tenant (p. ej. "Gard Security").
 */
import { prisma } from "@/lib/prisma";
import {
  isOwnCompanyAccount,
  loadOwnTenant,
} from "@/modules/crm/email/own-tenant-company";

export type ThreadAccountDealIds = {
  accountId: string | null;
  dealId: string | null;
};

export async function healThreadAccountToDealAccount(params: {
  tenantId: string;
  threadId: string;
  accountId: string | null;
  dealId: string | null;
}): Promise<ThreadAccountDealIds> {
  const { tenantId, threadId, accountId, dealId } = params;
  let nextAccountId = accountId;
  let nextDealId = dealId;

  if (dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId },
      select: { id: true, accountId: true },
    });
    if (!deal) {
      await prisma.crmEmailThread.update({
        where: { id: threadId },
        data: { dealId: null },
      });
      nextDealId = null;
    } else if (deal.accountId !== nextAccountId) {
      await prisma.crmEmailThread.update({
        where: { id: threadId },
        data: { accountId: deal.accountId },
      });
      nextAccountId = deal.accountId;
    }
  }

  if (!nextAccountId) {
    return { accountId: nextAccountId, dealId: nextDealId };
  }

  const [account, own] = await Promise.all([
    prisma.crmAccount.findFirst({
      where: { id: nextAccountId, tenantId },
      select: { id: true, name: true, website: true },
    }),
    loadOwnTenant(tenantId),
  ]);

  if (!account || !isOwnCompanyAccount(account, own)) {
    return { accountId: nextAccountId, dealId: nextDealId };
  }

  // Cuenta propia del tenant: desasociar. Si el deal también era de esa cuenta, limpiarlo.
  await prisma.crmEmailThread.update({
    where: { id: threadId },
    data: { accountId: null, dealId: null },
  });
  return { accountId: null, dealId: null };
}
