import { prisma } from "@/lib/prisma";
import { VRA_SYSTEM_CATALOG } from "./section-catalog-system";

/**
 * Código estable del TipoDocOperacional al que se vinculan automáticamente
 * los informes VRA al ser generados. Capa: instalacion.
 */
export const VRA_TIPO_DOC_CODIGO = "informe_vulnerabilidad";

/**
 * Asegura que exista el TipoDocOperacional "informe_vulnerabilidad" capa instalacion
 * para el tenant. Idempotente. Si el tenant ya tiene un tipo con ese código (creado
 * manualmente en algún momento), respeta su nombre y configuración existente.
 *
 * Se llama desde ensureTenantCatalogSeeded para garantizar el linkaje cuando el
 * pipeline VRA (Bloque 2) genere el PDF y cree el DocOperacional automático.
 */
export async function ensureVulnerabilityDocType(
  tenantId: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.tipoDocOperacional.findFirst({
    where: { tenantId, codigo: VRA_TIPO_DOC_CODIGO },
  });
  if (existing) {
    return { id: existing.id, created: false };
  }

  const maxOrder = await prisma.tipoDocOperacional.findFirst({
    where: { tenantId, capa: "instalacion" },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const tipo = await prisma.tipoDocOperacional.create({
    data: {
      tenantId,
      codigo: VRA_TIPO_DOC_CODIGO,
      nombre: "Informe de Vulnerabilidad",
      descripcion:
        "Informe técnico de evaluación de vulnerabilidades, amenazas y riesgos (VTRA) generado por el módulo VRA o subido manualmente.",
      capa: "instalacion",
      obligatorio: false,
      tieneVencimiento: true,
      diasAlerta: 30,
      normativa: "ISO 31000 / ASIS POA / CPTED",
      order: (maxOrder?.order ?? 19) + 1,
      isActive: true,
      obligatorioEnVisita: false,
    },
  });

  return { id: tipo.id, created: true };
}

/**
 * Siembra el catálogo system VRA en la BD si aún no existe.
 * Se llama desde el script de seed global o desde el endpoint /api/vra/section-templates/seed.
 * Idempotente: usa upsert por key con tenant_id NULL.
 */
export async function ensureSystemCatalogSeeded(): Promise<void> {
  for (const def of VRA_SYSTEM_CATALOG) {
    const existing = await prisma.vraSectionTemplate.findFirst({
      where: { tenantId: null, key: def.key, isSystem: true },
    });
    if (existing) {
      await prisma.vraSectionTemplate.update({
        where: { id: existing.id },
        data: {
          title: def.title,
          description: def.description,
          aiPromptHint: def.aiPromptHint ?? null,
          outputType: def.outputType,
          dataInputs: def.dataInputs,
          sortOrder: def.sortOrder,
          isMandatory: def.isMandatory ?? false,
          iconName: def.iconName ?? null,
        },
      });
    } else {
      await prisma.vraSectionTemplate.create({
        data: {
          tenantId: null,
          key: def.key,
          title: def.title,
          description: def.description,
          aiPromptHint: def.aiPromptHint ?? null,
          outputType: def.outputType,
          dataInputs: def.dataInputs,
          sortOrder: def.sortOrder,
          isEnabled: true,
          isSystem: true,
          isMandatory: def.isMandatory ?? false,
          iconName: def.iconName ?? null,
        },
      });
    }
  }
}

/**
 * Clona el catálogo system en el tenant especificado y asegura el TipoDocOperacional.
 * Se llama la primera vez que el tenant entra a configuración VRA.
 * Idempotente: solo clona keys que aún no existan en el tenant.
 */
export async function ensureTenantCatalogSeeded(
  tenantId: string,
  userId: string,
): Promise<{ created: number; skipped: number; tipoDocCreated: boolean }> {
  await ensureSystemCatalogSeeded();

  const tipoDoc = await ensureVulnerabilityDocType(tenantId);

  const systemTemplates = await prisma.vraSectionTemplate.findMany({
    where: { tenantId: null, isSystem: true },
    orderBy: { sortOrder: "asc" },
  });

  const existingTenant = await prisma.vraSectionTemplate.findMany({
    where: { tenantId },
    select: { key: true },
  });
  const existingKeys = new Set(existingTenant.map((t) => t.key));

  let created = 0;
  let skipped = 0;

  for (const sys of systemTemplates) {
    if (existingKeys.has(sys.key)) {
      skipped++;
      continue;
    }
    await prisma.vraSectionTemplate.create({
      data: {
        tenantId,
        parentId: sys.id,
        key: sys.key,
        title: sys.title,
        description: sys.description,
        aiPromptHint: sys.aiPromptHint,
        outputType: sys.outputType,
        dataInputs: sys.dataInputs ?? [],
        sortOrder: sys.sortOrder,
        isEnabled: true,
        isSystem: false,
        isMandatory: sys.isMandatory,
        iconName: sys.iconName,
        createdBy: userId,
      },
    });
    created++;
  }

  return { created, skipped, tipoDocCreated: tipoDoc.created };
}

/**
 * Calcula la numeración automática de las secciones de un tenant.
 * Las secciones de output_type "photo_gallery" | "norms_table" | "glossary"
 * se enumeran como anexos (A, B, C...). El resto como decimal (1, 2, 3...).
 */
export function computeNumbering(
  sections: Array<{
    outputType: string;
    sortOrder: number;
    numberingOverride?: string | null;
  }>,
): Map<number, string> {
  const ANNEX_TYPES = new Set(["photo_gallery", "norms_table", "glossary"]);
  const result = new Map<number, string>();
  let mainCount = 0;
  let annexCount = 0;

  const sorted = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const s of sorted) {
    if (s.numberingOverride) {
      result.set(s.sortOrder, s.numberingOverride);
      continue;
    }
    if (ANNEX_TYPES.has(s.outputType)) {
      annexCount++;
      result.set(s.sortOrder, String.fromCharCode(64 + annexCount));
    } else {
      mainCount++;
      result.set(s.sortOrder, String(mainCount));
    }
  }
  return result;
}
