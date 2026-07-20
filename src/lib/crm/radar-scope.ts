import { prisma } from "@/lib/prisma";

/** Nombre del negocio o cuenta para encabezados de alertas del radar. */
export async function scopeName(
  tenantId: string,
  dealId: string | null,
  accountId: string | null,
): Promise<string> {
  if (dealId) {
    const d = await prisma.crmDeal.findFirst({ where: { id: dealId, tenantId }, select: { title: true } });
    if (d?.title) return d.title;
  }
  if (accountId) {
    const a = await prisma.crmAccount.findFirst({ where: { id: accountId, tenantId }, select: { name: true } });
    if (a?.name) return a.name;
  }
  return "la cuenta";
}

/** Deep-link interno al negocio o la cuenta. */
export function scopeLink(dealId: string | null, accountId: string | null): string {
  if (dealId) return `/crm/deals/${dealId}`;
  if (accountId) return `/crm/accounts/${accountId}`;
  return "/crm";
}
