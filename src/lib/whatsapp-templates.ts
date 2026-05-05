/**
 * WhatsApp Template Resolution — Punto único de entrada.
 *
 * Cascada (en este orden):
 *   1. DocTemplate (module=whatsapp, usageSlug=slug) → resolver con entities → texto plano
 *   2. CrmWhatsAppTemplate.body + waValues → texto resuelto (LEGACY, eliminar en PR5)
 *   3. WA_TEMPLATE_DEFAULTS[slug].body (LEGACY, eliminar en PR5)
 *
 * Después de PR5, solo queda paso 1 (con seed garantizando que todo tenant tenga plantillas).
 */

import { prisma } from "@/lib/prisma";
import { resolveDocument, tiptapToPlainText, type EntityData } from "@/lib/docs/token-resolver";
import { WA_TEMPLATE_DEFAULTS } from "@/lib/wa-template-defaults";

/** Reemplaza tokens {key} en un template plain-text (legacy CrmWhatsAppTemplate). */
export function resolveWaTokens(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    const token = key.startsWith("{") ? key : `{${key}}`;
    result = result.replaceAll(token, value || "");
  }
  result = result.replace(/\{[a-zA-Z_]+\}/g, "");
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}

export type GetWaTemplateContext = {
  /** Entidades para resolver tokens DocTemplate (account, contact, deal, lead, actor, tenant, system, blocks, ...) */
  entities?: EntityData;
  /** Valores para tokens legacy CrmWhatsAppTemplate ({nombre}, {empresa}, etc.) */
  waValues?: Record<string, string>;
};

/**
 * Obtiene el cuerpo resuelto de una plantilla WhatsApp por slug.
 */
export async function getWaTemplate(
  tenantId: string,
  slug: string,
  context?: GetWaTemplateContext,
): Promise<string> {
  // 1. DocTemplate (sistema unificado)
  const docTpl = await prisma.docTemplate.findFirst({
    where: { tenantId, module: "whatsapp", usageSlug: slug, isActive: true },
    select: { content: true },
  });
  if (docTpl?.content && context?.entities) {
    const { resolvedContent } = resolveDocument(docTpl.content as never, context.entities);
    return tiptapToPlainText(resolvedContent).trim();
  }

  // 2. Legacy CrmWhatsAppTemplate
  const legacy = await prisma.crmWhatsAppTemplate.findUnique({
    where: { tenantId_slug: { tenantId, slug } },
  });
  let body: string;
  if (legacy?.isActive && legacy.body) {
    body = legacy.body;
  } else {
    body = WA_TEMPLATE_DEFAULTS[slug]?.body ?? "";
  }
  if (context?.waValues && body) {
    return resolveWaTokens(body, context.waValues);
  }
  return body;
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
