/**
 * Seed de plantillas WhatsApp para un tenant.
 *
 * Crea DocTemplate (module="whatsapp", usageSlug=slug) por cada seed que NO exista.
 * No sobrescribe plantillas existentes (idempotente).
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
  errors: { slug: string; error: string }[];
}

export async function seedWaTemplatesForTenant(
  tenantId: string,
  createdByAdminId: string,
): Promise<SeedResult> {
  const existing = await prisma.docTemplate.findMany({
    where: { tenantId, module: "whatsapp" },
    select: { usageSlug: true },
  });
  const existingSlugs = new Set(
    existing.map((t) => t.usageSlug).filter((s): s is string => !!s),
  );

  const result: SeedResult = {
    tenantId,
    created: [],
    skipped: [],
    errors: [],
  };

  for (const seed of WA_TEMPLATE_SEEDS) {
    if (existingSlugs.has(seed.slug)) {
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
