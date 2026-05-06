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

import { prisma } from "@/lib/prisma";
import { resolveDocument, tiptapToPlainText, type EntityData } from "@/lib/docs/token-resolver";

export type GetWaTemplateContext = {
  /** Entidades para resolver tokens DocTemplate (account, contact, deal, lead, actor, tenant, system, blocks, ...) */
  entities?: EntityData;
};

/**
 * Obtiene el cuerpo resuelto de una plantilla WhatsApp por slug.
 */
export async function getWaTemplate(
  tenantId: string,
  slug: string,
  context?: GetWaTemplateContext,
): Promise<string> {
  const docTpl = await prisma.docTemplate.findFirst({
    where: { tenantId, module: "whatsapp", usageSlug: slug, isActive: true },
    select: { content: true },
  });

  if (!docTpl?.content) {
    console.warn(
      `[whatsapp] Plantilla no encontrada para tenant ${tenantId}, slug "${slug}". ` +
        `Ejecutar seedWaTemplatesForTenant para garantizar plantillas por defecto.`,
    );
    return "";
  }

  if (!context?.entities) {
    return tiptapToPlainText(docTpl.content as never).trim();
  }

  const { resolvedContent } = resolveDocument(docTpl.content as never, context.entities);
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
