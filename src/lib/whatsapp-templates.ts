/**
 * WhatsApp Template Resolution — Punto único de entrada.
 *
 * Resuelve plantillas WhatsApp por slug usando DocTemplate (module=whatsapp,
 * usageSlug=slug) con tokens. El seed garantiza que todo tenant tiene las
 * plantillas activas tras `seedWaTemplatesForTenant`.
 *
 * Si una plantilla no existe (caso edge: tenant nuevo sin seed), retorna
 * string vacío y loguea warning.
 *
 * PR5 eliminó la cascada legacy:
 *   1. ~~CrmWhatsAppTemplate.body + waValues~~ (eliminado)
 *   2. ~~WA_TEMPLATE_DEFAULTS[slug].body~~ (eliminado)
 *   3. DocTemplate (único path)
 */

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import {
  extractTokenKeys,
  resolveDocument,
  tiptapToPlainText,
  type EntityData,
} from "@/lib/docs/token-resolver";
import {
  migrateLegacyPlaceholdersInTiptap,
} from "@/lib/docs/wa-template-migrations";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { buildPortalClienteMagicLinkUrl } from "@/lib/portal-cliente-magic-link";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { normalizePhone } from "@/lib/psych/normalizePhone";

export type GetWaTemplateContext = {
  /** Entidades para resolver tokens DocTemplate (account, contact, deal, lead, actor, tenant, system, blocks, ...) */
  entities?: EntityData;
};

/**
 * Obtiene el cuerpo resuelto de una plantilla WhatsApp por slug.
 *
 * Self-healing: si el DocTemplate del tenant contiene placeholders del formato
 * legacy single-brace (p. ej. `{nombre}`, `{empresa}`) — restos del seed viejo
 * que el resolver no procesa — los migramos al formato `{{module.field}}` y
 * persistimos el contenido de vuelta. Es idempotente.
 */
export async function getWaTemplate(
  tenantId: string,
  slug: string,
  context?: GetWaTemplateContext,
): Promise<string> {
  const docTpl = await prisma.docTemplate.findFirst({
    where: { tenantId, module: "whatsapp", usageSlug: slug, isActive: true },
    select: { id: true, content: true },
  });

  if (!docTpl?.content) {
    console.warn(
      `[whatsapp] Plantilla no encontrada para tenant ${tenantId}, slug "${slug}". ` +
        `Ejecutar seedWaTemplatesForTenant para garantizar plantillas por defecto.`,
    );
    return "";
  }

  let content = docTpl.content as unknown;

  const { migrated, changed } = migrateLegacyPlaceholdersInTiptap(content, slug);
  if (changed) {
    content = migrated;
    try {
      await prisma.docTemplate.update({
        where: { id: docTpl.id },
        data: {
          content: migrated as object,
          tokensUsed: extractTokenKeys(migrated),
        },
      });
    } catch (err) {
      console.warn(
        `[whatsapp] No se pudo persistir migración legacy para tenant ${tenantId}, slug "${slug}":`,
        err,
      );
    }
  }

  if (!context?.entities) {
    return tiptapToPlainText(content as never).trim();
  }

  const { resolvedContent } = resolveDocument(content as never, context.entities);
  return tiptapToPlainText(resolvedContent).trim();
}

/**
 * Construye la URL wa.me con el mensaje pre-llenado.
 * - Si phone está presente, abre chat directo: https://wa.me/{phone}?text=...
 * - Si phone es null/undefined, deja al usuario elegir contacto: https://wa.me/?text=...
 *
 * IMPORTANTE: phone debe venir normalizado (solo dígitos, con código país, sin +).
 */
export function buildWaUrl(message: string, phone?: string | null): string {
  const text = encodeURIComponent(message.trim());
  if (phone && phone.length > 0) {
    return `https://wa.me/${phone}?text=${text}`;
  }
  return `https://wa.me/?text=${text}`;
}

/**
 * Atajo: resuelve template y construye URL en una llamada.
 */
export async function getWaTemplateAndUrl(
  tenantId: string,
  slug: string,
  context: GetWaTemplateContext & { phone?: string | null },
): Promise<{ message: string; url: string }> {
  const message = await getWaTemplate(tenantId, slug, context);
  const url = buildWaUrl(message, context.phone);
  return { message, url };
}

/** Enriquece un deal de Prisma con tokens computados para plantillas WA/email. */
export function enrichDealForWaTemplate(
  deal: Record<string, unknown>,
  contact: { id?: string; email?: string | null } | null | undefined,
  resolvedProposalLink: string | null,
): Record<string, unknown> {
  const proposalSentAt = deal.proposalSentAt;
  const proposalSentDate =
    proposalSentAt instanceof Date
      ? format(proposalSentAt, "d 'de' MMMM 'de' yyyy", { locale: es })
      : typeof proposalSentAt === "string" && proposalSentAt
        ? format(new Date(proposalSentAt), "d 'de' MMMM 'de' yyyy", { locale: es })
        : "reciente";

  return {
    ...deal,
    proposalLink: resolvedProposalLink ?? deal.proposalLink ?? null,
    proposalSentDate,
  };
}

/**
 * Carga un negocio con sus relaciones y arma EntityData lista para resolver
 * plantillas WhatsApp (contact, account, deal con magic-link y fecha formateada).
 */
export async function buildDealWaEntities(
  tenantId: string,
  dealId: string,
): Promise<{ entities: EntityData; phone: string | null } | null> {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    include: { account: true, primaryContact: true },
  });
  if (!deal) return null;

  const contact = deal.primaryContact;
  const phoneRaw = contact?.phone ?? null;
  const normalized = phoneRaw ? normalizePhone(phoneRaw) : null;
  const phone = normalized?.ok ? normalized.digits : null;

  let resolvedProposalLink = deal.proposalLink ?? null;
  if (contact?.email && contact.id) {
    try {
      const tenantRow = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true },
      });
      resolvedProposalLink =
        buildPortalClienteMagicLinkUrl({
          baseSiteUrl: getCanonicalSiteUrl(),
          email: contact.email,
          tenantSlug: tenantRow?.slug ?? null,
          contactId: contact.id,
          expiryDays: 30,
        }) || resolvedProposalLink;
    } catch {
      // PORTAL_COOKIE_SECRET ausente: caer al link estándar del deal.
    }
  }

  const tenantCfg = await getTenantCompanyConfig(tenantId);

  return {
    entities: {
      deal: enrichDealForWaTemplate(
        deal as unknown as Record<string, unknown>,
        contact,
        resolvedProposalLink,
      ),
      account: deal.account ?? undefined,
      contact: contact ?? undefined,
      installation: {
        name: deal.installationName ?? null,
        address: deal.address ?? null,
        commune: deal.commune ?? null,
        city: deal.city ?? null,
      },
      tenant: {
        commercialName: tenantCfg.commercialName,
        website: tenantCfg.website,
        phone: tenantCfg.phone,
        email: tenantCfg.email,
        whatsappLink: tenantCfg.whatsappLink,
      },
    },
    phone,
  };
}
