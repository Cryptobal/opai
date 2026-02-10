/**
 * WhatsApp Template — Resolución desde Gestión Documental (DocTemplate) o legacy (CrmWhatsAppTemplate).
 *
 * Prioridad: 1) DocTemplate (module=whatsapp, usageSlug=slug) con entities → texto resuelto
 *            2) CrmWhatsAppTemplate.body + waValues → texto resuelto
 *            3) WA_TEMPLATE_DEFAULTS[slug].body
 */

import { prisma } from "@/lib/prisma";
import { resolveDocument, tiptapToPlainText, type EntityData } from "@/lib/docs/token-resolver";

/** Reemplaza tokens {key} en un template con valores del mapa (legacy) */
export function resolveWaTokens(
  template: string,
  values: Record<string, string>
): string {
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
  entities?: EntityData;
  waValues?: Record<string, string>;
};

/**
 * Obtiene el cuerpo de una plantilla WhatsApp por slug.
 * - Si existe DocTemplate (module=whatsapp, usageSlug=slug): usa content Tiptap, resuelve con context.entities y devuelve texto plano.
 * - Si no, usa CrmWhatsAppTemplate o default; si context.waValues está definido, resuelve {tokens} y devuelve el texto.
 */
export async function getWaTemplate(
  tenantId: string,
  slug: string,
  context?: GetWaTemplateContext
): Promise<string> {
  const { WA_TEMPLATE_DEFAULTS } = await import(
    "@/app/api/crm/whatsapp-templates/route"
  );

  const docTpl = await prisma.docTemplate.findFirst({
    where: {
      tenantId,
      module: "whatsapp",
      usageSlug: slug,
      isActive: true,
    },
    select: { content: true },
  });

  if (docTpl?.content && context?.entities) {
    const { resolvedContent } = resolveDocument(
      docTpl.content as any,
      context.entities
    );
    return tiptapToPlainText(resolvedContent);
  }

  let body: string;
  const legacy = await prisma.crmWhatsAppTemplate.findUnique({
    where: { tenantId_slug: { tenantId, slug } },
  });
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
