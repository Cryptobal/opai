/**
 * Anclaje de conversaciones del asistente: tipos, permisos y mapeo desde page context.
 */
import { prisma } from "@/lib/prisma";
import { canView, type RolePermissions } from "@/lib/permissions";
import type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";

export const ANCHOR_TYPES = ["crm_deal", "crm_account", "cpq_quote", "crm_lead"] as const;
export type AnchorType = (typeof ANCHOR_TYPES)[number];

export function isAnchorType(value: string): value is AnchorType {
  return (ANCHOR_TYPES as readonly string[]).includes(value);
}

export function pageContextToAnchor(
  pageContext: HelpChatPageContext | null | undefined,
): { type: AnchorType; id: string } | null {
  if (!pageContext?.entityType || !pageContext.entityId) return null;
  if (isAnchorType(pageContext.entityType)) {
    return { type: pageContext.entityType, id: pageContext.entityId };
  }
  return null;
}

export async function assertAnchorAccess(
  tenantId: string,
  perms: RolePermissions,
  type: string,
  id: string,
): Promise<boolean> {
  if (!isAnchorType(type) || !id) return false;

  if (type === "crm_deal") {
    if (!canView(perms, "crm", "deals") && !canView(perms, "crm")) return false;
    const deal = await prisma.crmDeal.findFirst({ where: { id, tenantId }, select: { id: true } });
    return Boolean(deal);
  }
  if (type === "crm_account") {
    if (!canView(perms, "crm", "accounts") && !canView(perms, "crm")) return false;
    const account = await prisma.crmAccount.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    return Boolean(account);
  }
  if (type === "cpq_quote") {
    if (!canView(perms, "cpq") && !canView(perms, "crm", "quotes")) return false;
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    return Boolean(quote);
  }
  if (type === "crm_lead") {
    if (!canView(perms, "crm", "leads") && !canView(perms, "crm")) return false;
    const lead = await prisma.crmLead.findFirst({ where: { id, tenantId }, select: { id: true } });
    return Boolean(lead);
  }
  return false;
}

export function conversationTitleForAnchor(type: AnchorType, entityName: string): string {
  const prefix =
    type === "crm_deal"
      ? "Negocio"
      : type === "cpq_quote"
        ? "Cotización"
        : type === "crm_lead"
          ? "Lead"
          : "Cuenta";
  return `${prefix}: ${entityName}`.slice(0, 80);
}
