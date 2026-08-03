/**
 * Resuelve el contacto a asociar a una cotización CPQ.
 * Prioridad: contactId explícito → primaryContact del deal → contacto principal
 * de la cuenta → primer contacto de la cuenta.
 */
import { prisma } from "@/lib/prisma";
import { isUuid } from "@/lib/utils/uuid";

export type QuoteContactResolveSource =
  | "explicit"
  | "deal"
  | "account_primary"
  | "account_first"
  | "none";

export type QuoteContactResolveResult =
  | { ok: true; contactId: string; source: Exclude<QuoteContactResolveSource, "none"> }
  | { ok: false; contactId: null; source: "none"; error: string };

export async function resolveContactIdForCpqQuote(params: {
  tenantId: string;
  accountId: string;
  dealId?: string | null;
  explicitContactId?: string | null;
}): Promise<QuoteContactResolveResult> {
  const { tenantId, accountId } = params;
  const explicit =
    typeof params.explicitContactId === "string" && params.explicitContactId.trim()
      ? params.explicitContactId.trim()
      : null;

  if (explicit) {
    if (!isUuid(explicit)) {
      return {
        ok: false,
        contactId: null,
        source: "none",
        error: "El contactId no tiene formato válido. Usa search_contacts para obtenerlo.",
      };
    }
    const contact = await prisma.crmContact.findFirst({
      where: { id: explicit, tenantId, accountId },
      select: { id: true },
    });
    if (!contact) {
      return {
        ok: false,
        contactId: null,
        source: "none",
        error:
          "El contacto indicado no existe, no pertenece a tu organización o no está en esa cuenta. Usa search_contacts.",
      };
    }
    return { ok: true, contactId: contact.id, source: "explicit" };
  }

  const dealId =
    typeof params.dealId === "string" && params.dealId.trim() ? params.dealId.trim() : null;
  if (dealId && isUuid(dealId)) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId },
      select: { primaryContactId: true },
    });
    if (deal?.primaryContactId) {
      const fromDeal = await prisma.crmContact.findFirst({
        where: { id: deal.primaryContactId, tenantId, accountId },
        select: { id: true },
      });
      if (fromDeal) {
        return { ok: true, contactId: fromDeal.id, source: "deal" };
      }
    }
  }

  const primary = await prisma.crmContact.findFirst({
    where: { tenantId, accountId, isPrimary: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (primary) {
    return { ok: true, contactId: primary.id, source: "account_primary" };
  }

  const first = await prisma.crmContact.findFirst({
    where: { tenantId, accountId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (first) {
    return { ok: true, contactId: first.id, source: "account_first" };
  }

  return {
    ok: false,
    contactId: null,
    source: "none",
    error:
      "No hay contacto en la cuenta para asociar a la cotización. Crea uno con create_contact (o pásalo con contactId) y vuelve a intentar.",
  };
}
