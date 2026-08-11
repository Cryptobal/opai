import { prisma } from "@/lib/prisma";
import {
  LEGACY_OPERACIONAL,
  LEGACY_PERSONA,
  type ParityReport,
} from "@/lib/docs/migration/types";
import {
  diffIdSets,
  legacyAlertIds,
  unifiedAlertIds,
} from "@/lib/docs/migration/alert-ids";
import {
  checkOperacionalFields,
  checkPersonaFields,
} from "@/lib/docs/migration/parity-fields";

export async function verifyParity(tenantId: string): Promise<ParityReport> {
  const mismatches: ParityReport["mismatches"] = [];

  const [personaCount, opCount, migPersona, migOp] = await Promise.all([
    prisma.opsDocumentoPersona.count({ where: { tenantId } }),
    prisma.docOperacional.count({ where: { tenantId } }),
    prisma.documento.count({
      where: { tenantId, legacySource: LEGACY_PERSONA },
    }),
    prisma.documento.count({
      where: { tenantId, legacySource: LEGACY_OPERACIONAL },
    }),
  ]);

  if (personaCount !== migPersona) {
    mismatches.push({
      kind: "count_persona",
      detail: `legado=${personaCount} migrado=${migPersona}`,
    });
  }
  if (opCount !== migOp) {
    mismatches.push({
      kind: "count_operacional",
      detail: `legado=${opCount} migrado=${migOp}`,
    });
  }

  await checkPersonaFields(tenantId, mismatches);
  await checkOperacionalFields(tenantId, mismatches);

  const legacyAlerts = await legacyAlertIds(tenantId);
  const unifiedAlerts = await unifiedAlertIds(tenantId);
  const diff = diffIdSets(legacyAlerts, unifiedAlerts);
  if (diff.onlyLegacy.length || diff.onlyUnified.length) {
    mismatches.push({
      kind: "alert_ids",
      detail: `onlyLegacy=${diff.onlyLegacy.length} onlyUnified=${diff.onlyUnified.length}`,
      sampleIds: [...diff.onlyLegacy.slice(0, 10), ...diff.onlyUnified.slice(0, 10)],
    });
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    counts: {
      personaCount,
      opCount,
      migPersona,
      migOp,
      legacyAlerts: legacyAlerts.size,
      unifiedAlerts: unifiedAlerts.size,
    },
  };
}
