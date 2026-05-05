import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { getWaTemplateAndUrl } from "@/lib/whatsapp-templates";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { prisma } from "@/lib/prisma";

const resolveSchema = z.object({
  slug: z.string().min(1),
  /** ID del lead, deal, contact, account o guardia (solo uno aplica según slug) */
  entityId: z.string().optional(),
  entityType: z
    .enum(["lead", "deal", "contact", "account", "guardia", "quote"])
    .optional(),
  /** Datos adicionales para tokens system.* (portalUrl, portalPin, formUrl, mapsLink, etc.) */
  systemTokens: z.record(z.string(), z.string()).optional(),
  /** Teléfono override (si no se quiere usar el del entity). */
  phoneOverride: z.string().optional(),
});

/**
 * POST /api/whatsapp/resolve-template
 *
 * Resuelve una plantilla WhatsApp por slug + entity desde el cliente.
 * Carga las entidades necesarias (lead/deal/contact/account/guardia/quote) y
 * el contexto del tenant + actor (ejecutivo logueado), aplica los tokens
 * runtime (system.*) que vengan del cliente y construye la URL wa.me.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const parsed = await parseBody(request, resolveSchema);
  if (parsed.error) return parsed.error;
  const { slug, entityId, entityType, systemTokens, phoneOverride } = parsed.data;

  // Entities siempre incluyen tenant + actor + system runtime.
  const entities: Record<string, unknown> = { system: systemTokens || {} };
  let phone: string | null = null;

  // Tenant (datos de la empresa-marca configurados)
  const tenantCfg = await getTenantCompanyConfig(ctx.tenantId);
  entities.tenant = {
    commercialName: tenantCfg.commercialName,
    website: tenantCfg.website,
    phone: tenantCfg.phone,
    email: tenantCfg.email,
    whatsappLink: tenantCfg.whatsappLink,
  };

  // Actor (ejecutivo logueado). El modelo es Admin (no User), con `name` único
  // (no firstName/lastName). Splitamos por primer espacio para alimentar
  // actor.firstName / actor.lastName, y dejamos `name` y `cargo` también.
  const admin = await prisma.admin.findUnique({
    where: { id: ctx.userId },
    select: { name: true, email: true, cargo: true },
  });
  if (admin) {
    const parts = (admin.name || "").trim().split(/\s+/);
    const firstName = parts.length > 0 ? parts[0] : "";
    const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
    entities.actor = {
      firstName,
      lastName,
      name: admin.name,
      email: admin.email,
      roleTitle: admin.cargo || "",
    };
  }

  // Cargar entity específica
  if (entityType && entityId) {
    if (entityType === "lead") {
      const lead = await prisma.crmLead.findFirst({
        where: { id: entityId, tenantId: ctx.tenantId },
      });
      if (lead) {
        entities.lead = {
          ...lead,
          // serviceLabel: alias del campo serviceType para tokens semánticos.
          serviceLabel: lead.serviceType ?? "",
        };
        phone = lead.phone || null;
      }
    } else if (entityType === "deal") {
      const deal = await prisma.crmDeal.findFirst({
        where: { id: entityId, tenantId: ctx.tenantId },
        include: { account: true, primaryContact: true },
      });
      if (deal) {
        entities.deal = deal;
        if (deal.account) entities.account = deal.account;
        if (deal.primaryContact) entities.contact = deal.primaryContact;
        // CrmDeal no tiene relación `installation`; sintetizamos una con sus
        // campos planos (installationName/address/commune/city) para alimentar
        // los tokens {{installation.*}}.
        entities.installation = {
          name: deal.installationName ?? null,
          address: deal.address ?? null,
          commune: deal.commune ?? null,
          city: deal.city ?? null,
        };
        phone = deal.primaryContact?.phone || null;
      }
    } else if (entityType === "contact") {
      const contact = await prisma.crmContact.findFirst({
        where: { id: entityId, tenantId: ctx.tenantId },
        include: { account: true },
      });
      if (contact) {
        entities.contact = contact;
        if (contact.account) entities.account = contact.account;
        phone = contact.phone || null;
      }
    } else if (entityType === "account") {
      const account = await prisma.crmAccount.findFirst({
        where: { id: entityId, tenantId: ctx.tenantId },
        include: { contacts: { where: { isPrimary: true }, take: 1 } },
      });
      if (account) {
        entities.account = account;
        const primary = account.contacts[0];
        if (primary) entities.contact = primary;
        phone = primary?.phone || null;
      }
    } else if (entityType === "guardia") {
      const guardia = await prisma.opsGuardia.findFirst({
        where: { id: entityId, tenantId: ctx.tenantId },
        include: { persona: true },
      });
      if (guardia) {
        entities.guardia = {
          ...guardia.persona,
          code: guardia.code,
        };
        phone = guardia.persona?.phoneMobile || guardia.persona?.phone || null;
      }
    } else if (entityType === "quote") {
      const quote = await prisma.cpqQuote.findFirst({
        where: { id: entityId, tenantId: ctx.tenantId },
        include: { installation: true },
      });
      if (quote) {
        entities.quote = quote;
        if (quote.installation) entities.installation = quote.installation;
        // CpqQuote tiene FKs scalar (accountId/contactId/dealId) sin relación.
        // Cargamos manualmente lo que necesitemos para los tokens.
        if (quote.contactId) {
          const contact = await prisma.crmContact.findUnique({
            where: { id: quote.contactId },
          });
          if (contact) {
            entities.contact = contact;
            phone = contact.phone || null;
          }
        }
        if (quote.accountId) {
          const account = await prisma.crmAccount.findUnique({
            where: { id: quote.accountId },
          });
          if (account) entities.account = account;
        }
        if (quote.dealId) {
          const deal = await prisma.crmDeal.findUnique({
            where: { id: quote.dealId },
          });
          if (deal) entities.deal = deal;
        }
      }
    }
  }

  if (phoneOverride) phone = phoneOverride;

  // Normalización de teléfono (formato Chile: 9 dígitos → +56; 11 con prefijo ya OK)
  let normalizedPhone: string | null = null;
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 9) normalizedPhone = `56${digits}`;
    else if (digits.length === 11 && digits.startsWith("56")) normalizedPhone = digits;
    else if (digits.length >= 10) normalizedPhone = digits;
  }

  const { message, url } = await getWaTemplateAndUrl(ctx.tenantId, slug, {
    entities: entities as never,
    phone: normalizedPhone,
  });

  return NextResponse.json({
    success: true,
    data: { message, url, phone: normalizedPhone },
  });
}
