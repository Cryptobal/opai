/**
 * Seed de plantillas WhatsApp para un tenant.
 *
 * Crea DocTemplate (module="whatsapp", usageSlug=slug) por cada seed que NO exista.
 * No sobrescribe plantillas personalizadas (idempotente), salvo parches
 * conocidos de copy roto (ej. cobranza_amable con dueDate vacío).
 *
 * Uso:
 * - Al crear tenant nuevo (hook en lib/tenant.ts, agregar en otro PR)
 * - Endpoint admin /api/platform/seed-wa-templates para re-seed manual
 */

import { prisma } from "@/lib/prisma";
import { WA_TEMPLATE_SEEDS, plainTextToTiptapJson } from "./wa-template-seeds";

export interface SeedResult {
  tenantId: string;
  created: string[]; // slugs creados
  skipped: string[]; // slugs ya existentes
  updated: string[]; // slugs parchados (copy canónico)
  errors: { slug: string; error: string }[];
}

/** Copy legacy que deja la fecha en blanco cuando FinanceDte.dueDate es null. */
const COBRANZA_AMABLE_LEGACY_SNIPPET =
  "con fecha de vencimiento {{dte.dueDate}}";

function contentIncludesLegacyCobranzaAmable(content: unknown): boolean {
  try {
    return JSON.stringify(content).includes(COBRANZA_AMABLE_LEGACY_SNIPPET);
  } catch {
    return false;
  }
}

export async function seedWaTemplatesForTenant(
  tenantId: string,
  createdByAdminId: string,
): Promise<SeedResult> {
  const existing = await prisma.docTemplate.findMany({
    where: { tenantId, module: "whatsapp" },
    select: { id: true, usageSlug: true, content: true },
  });
  const existingBySlug = new Map(
    existing
      .filter((t): t is typeof t & { usageSlug: string } => !!t.usageSlug)
      .map((t) => [t.usageSlug, t]),
  );

  const result: SeedResult = {
    tenantId,
    created: [],
    skipped: [],
    updated: [],
    errors: [],
  };

  for (const seed of WA_TEMPLATE_SEEDS) {
    const current = existingBySlug.get(seed.slug);
    if (current) {
      // Parche puntual: cobranza_amable con vencimiento vacío → emisión.
      if (
        seed.slug === "cobranza_amable" &&
        contentIncludesLegacyCobranzaAmable(current.content)
      ) {
        try {
          await prisma.docTemplate.update({
            where: { id: current.id },
            data: {
              content: plainTextToTiptapJson(seed.body) as object,
              name: seed.name,
            },
          });
          result.updated.push(seed.slug);
        } catch (err) {
          result.errors.push({
            slug: seed.slug,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        continue;
      }
      result.skipped.push(seed.slug);
      continue;
    }
    try {
      await prisma.docTemplate.create({
        data: {
          tenantId,
          module: "whatsapp",
          // categoría dummy para WA: lo importante es usageSlug. "general" se mapea
          // al item del catálogo whatsapp con la misma key.
          category: "general",
          usageSlug: seed.slug,
          name: seed.name,
          content: plainTextToTiptapJson(seed.body) as object,
          isActive: true,
          isDefault: false,
          createdBy: createdByAdminId,
        },
      });
      result.created.push(seed.slug);
    } catch (err) {
      result.errors.push({
        slug: seed.slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
