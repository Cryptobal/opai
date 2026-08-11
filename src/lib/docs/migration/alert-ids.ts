/**
 * Conjuntos de IDs de documentos que generarían alertas de vencimiento.
 * Paridad: legacy vs unificado deben coincidir (mismos IDs: la migración
 * reutiliza el UUID legado).
 */

import { prisma } from "@/lib/prisma";
import { getGuardiaDocumentosConfig } from "@/lib/guardia-documentos-config";
import { GUARDIA_ALERTING_LIFECYCLE_STATUSES } from "@/lib/personas";

export async function legacyAlertIds(tenantId: string): Promise<Set<string>> {
  const ids = new Set<string>();

  const ops = await prisma.docOperacional.findMany({
    where: {
      tenantId,
      expiresAt: { not: null },
      expiryDismissedAt: null,
      tipo: { tieneVencimiento: true, isActive: true },
    },
    select: { id: true },
  });
  for (const d of ops) ids.add(d.id);

  const cfg = await getGuardiaDocumentosConfig(tenantId);
  const types = cfg.filter((c) => c.hasExpiration).map((c) => c.code);
  if (types.length > 0) {
    const persona = await prisma.opsDocumentoPersona.findMany({
      where: {
        tenantId,
        expiresAt: { not: null },
        expiryDismissedAt: null,
        type: { in: types },
        guardia: {
          status: "active",
          lifecycleStatus: { in: [...GUARDIA_ALERTING_LIFECYCLE_STATUSES] },
        },
      },
      select: { id: true },
    });
    for (const d of persona) ids.add(d.id);
  }

  return ids;
}

export async function unifiedAlertIds(tenantId: string): Promise<Set<string>> {
  const docs = await prisma.documento.findMany({
    where: {
      tenantId,
      expiresAt: { not: null },
      expiryDismissedAt: null,
      needsClassification: false,
      OR: [
        { legacySource: "doc_operacional" },
        { legacySource: "ops_documento_persona" },
      ],
      tipo: { is: { tieneVencimiento: true, isActive: true } },
    },
    select: {
      id: true,
      legacySource: true,
      tipo: { select: { codigo: true, capa: true } },
      links: {
        where: { role: "owner" },
        select: { entityType: true, entityId: true },
        take: 1,
      },
    },
  });

  const cfg = await getGuardiaDocumentosConfig(tenantId);
  const guardiaTypes = new Set(
    cfg.filter((c) => c.hasExpiration).map((c) => c.code)
  );

  const ids = new Set<string>();
  for (const d of docs) {
    if (d.legacySource === "doc_operacional") {
      ids.add(d.id);
      continue;
    }
    // guardia: respetar config hasExpiration + guardia activo
    const codigo = d.tipo?.codigo;
    if (!codigo || !guardiaTypes.has(codigo)) {
      // También aceptar type legado si el código unificado es alias
      // (contrato_guardia vs contrato): incluir si legacy persona y tipo activo
      if (d.legacySource !== "ops_documento_persona") continue;
    }
    const owner = d.links[0];
    if (!owner || owner.entityType !== "guardia") continue;
    const g = await prisma.opsGuardia.findFirst({
      where: {
        id: owner.entityId,
        tenantId,
        status: "active",
        lifecycleStatus: { in: [...GUARDIA_ALERTING_LIFECYCLE_STATUSES] },
      },
      select: { id: true },
    });
    if (!g) continue;

    // Para persona: la lógica vieja filtra por type string en config.
    // Comparamos vía legacy row type.
    const legacy = await prisma.opsDocumentoPersona.findFirst({
      where: { id: d.id, tenantId },
      select: { type: true },
    });
    if (!legacy || !guardiaTypes.has(legacy.type)) continue;
    ids.add(d.id);
  }
  return ids;
}

export function diffIdSets(
  legacy: Set<string>,
  unified: Set<string>
): { onlyLegacy: string[]; onlyUnified: string[] } {
  const onlyLegacy: string[] = [];
  const onlyUnified: string[] = [];
  for (const id of legacy) if (!unified.has(id)) onlyLegacy.push(id);
  for (const id of unified) if (!legacy.has(id)) onlyUnified.push(id);
  return { onlyLegacy, onlyUnified };
}
