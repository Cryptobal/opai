/**
 * Slots de documentos de guardia (solo servidor — usa Prisma).
 * Para tipos/helpers en Client Components usar operational-guard-doc-slots-shared.
 */

import { prisma } from "@/lib/prisma";
import {
  FALLBACK_GUARD_TIPOS,
  type OperationalGuardDocSlot,
  personaTypesForOperationalCodigo,
  slotIsUploadable,
} from "@/lib/operational-guard-doc-slots-shared";

export type { OperationalGuardDocSlot } from "@/lib/operational-guard-doc-slots-shared";

export async function getOperationalGuardDocSlots(tenantId: string): Promise<OperationalGuardDocSlot[]> {
  const dbTipos = await prisma.tipoDocOperacional.findMany({
    where: { tenantId, capa: "guardia", isActive: true },
    orderBy: { order: "asc" },
  });

  const seen = new Set(dbTipos.map((t) => t.codigo));
  const slots: OperationalGuardDocSlot[] = [];

  for (const t of dbTipos) {
    const personaTypes = personaTypesForOperationalCodigo(t.codigo);
    if (!slotIsUploadable(personaTypes)) continue;
    slots.push({
      codigo: t.codigo,
      nombre: t.nombre,
      normativa: t.normativa,
      obligatorio: t.obligatorio,
      tieneVencimiento: t.tieneVencimiento,
      diasAlerta: t.diasAlerta,
      order: t.order,
      personaTypes,
    });
  }

  for (const f of FALLBACK_GUARD_TIPOS) {
    if (seen.has(f.codigo)) continue;
    const personaTypes = personaTypesForOperationalCodigo(f.codigo);
    if (!slotIsUploadable(personaTypes)) continue;
    slots.push({
      ...f,
      personaTypes,
    });
  }

  slots.sort((a, b) => a.order - b.order);
  return slots;
}
