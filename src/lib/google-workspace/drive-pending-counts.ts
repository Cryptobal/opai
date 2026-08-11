/**
 * Conteo estimado de documentos pendientes de espejo a Drive, por tipo.
 *
 * Estimación: un `sourceId` huérfano en la outbox (SENT de un doc ya borrado
 * en OPAI) puede inflar los enviados y bajar el pending. Es tolerable porque
 * el backfill es idempotente y un exceso solo produce no-ops.
 *
 * Una consulta agregada por fuente — nunca consultas dentro de un bucle.
 */

import { prisma } from "@/lib/prisma";
import { readsUnified } from "@/lib/docs/migration";
import {
  SUPPORTED_DOC_TYPES,
  type SupportedDocType,
} from "./drive-mirror-config";

export type PendingCount = {
  total: number;
  pending: number;
  /** Solo licitaciones: deals isLicitacion sin DriveFolderCache. */
  pendingFolders?: number;
};

export type PendingByDocType = Record<SupportedDocType, PendingCount>;

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: PendingByDocType }>();

export function clearPendingCountsCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

function emptyCounts(): PendingByDocType {
  const out = {} as PendingByDocType;
  for (const dt of SUPPORTED_DOC_TYPES) {
    out[dt] = { total: 0, pending: 0 };
  }
  return out;
}

function pendingOf(total: number, sent: number): number {
  return Math.max(0, total - sent);
}

export async function getPendingCounts(
  tenantId: string,
): Promise<PendingByDocType> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const value = await computePendingCounts(tenantId);
  cache.set(tenantId, { at: Date.now(), value });
  return value;
}

async function computePendingCounts(
  tenantId: string,
): Promise<PendingByDocType> {
  const result = emptyCounts();
  const unified = await readsUnified(tenantId);

  const [linkGroups, dealSplit, sentGroups, facturaTotal, pendingFolders, trabajadores, ops] =
    await Promise.all([
      prisma.documentoEnlace.groupBy({
        by: ["entityType"],
        where: {
          tenantId,
          entityType: {
            in: ["account", "installation", "contact", "lead"],
          },
          file: { storageKey: { not: null } },
        },
        _count: { _all: true },
      }),
      prisma.$queryRaw<Array<{ is_licitacion: boolean; total: number }>>`
        SELECT d.is_licitacion AS is_licitacion, COUNT(*)::int AS total
        FROM crm.file_links fl
        INNER JOIN crm.files f ON f.id = fl.file_id AND f.storage_key IS NOT NULL
        INNER JOIN crm.deals d ON d.id::text = fl.entity_id AND d.tenant_id = fl.tenant_id
        WHERE fl.tenant_id = ${tenantId} AND fl.entity_type = 'deal'
        GROUP BY d.is_licitacion
      `,
      prisma.driveExportOutbox.groupBy({
        by: ["docType", "sourceId"],
        where: { tenantId, status: "SENT" },
      }),
      prisma.financeDte.count({
        where: { tenantId, pdfR2Key: { not: null } },
      }),
      prisma.$queryRaw<Array<{ pending_folders: number }>>`
        SELECT COUNT(*)::int AS pending_folders
        FROM crm.deals d
        WHERE d.tenant_id = ${tenantId}
          AND d.is_licitacion = true
          AND NOT EXISTS (
            SELECT 1 FROM drive_folder_cache c
            WHERE c.tenant_id = d.tenant_id
              AND c.entity_type = 'deal'
              AND c.entity_id = d.id::text
          )
      `,
      unified
        ? prisma.documentoEnlace.count({
            where: {
              tenantId,
              entityType: "guardia",
              role: "owner",
              OR: [
                { file: { storageKey: { not: null } } },
                { file: { fileUrl: { not: null } } },
              ],
            },
          })
        : prisma.opsDocumentoPersona.count({
            where: { tenantId, fileUrl: { not: null } },
          }),
      unified
        ? prisma.documentoEnlace.count({
            where: {
              tenantId,
              entityType: { in: ["instalacion", "tenant"] },
              role: "owner",
              file: { storageKey: { not: null } },
            },
          })
        : prisma.docOperacional.count({ where: { tenantId } }),
    ]);

  const sentByType = new Map<string, number>();
  for (const row of sentGroups) {
    sentByType.set(row.docType, (sentByType.get(row.docType) ?? 0) + 1);
  }

  const linkByEntity = new Map(
    linkGroups.map((g) => [g.entityType, g._count._all]),
  );

  let licitacionDocs = 0;
  let negociosDocs = 0;
  for (const row of dealSplit) {
    if (row.is_licitacion) licitacionDocs = Number(row.total) || 0;
    else negociosDocs = Number(row.total) || 0;
  }

  const totals: Partial<Record<SupportedDocType, number>> = {
    documentos:
      (linkByEntity.get("account") ?? 0) + (linkByEntity.get("installation") ?? 0),
    personas: linkByEntity.get("contact") ?? 0,
    leads: linkByEntity.get("lead") ?? 0,
    licitacion: licitacionDocs,
    negocios: negociosDocs,
    factura: facturaTotal,
    // Cotizaciones: no hay fuente R2 listable histórica; total ≈ ya enviados.
    cotizacion: sentByType.get("cotizacion") ?? 0,
    trabajadores,
    ops_documentos: ops,
  };

  for (const dt of SUPPORTED_DOC_TYPES) {
    const total = totals[dt] ?? 0;
    const sent = sentByType.get(dt) ?? 0;
    result[dt] = { total, pending: pendingOf(total, sent) };
  }

  result.licitacion.pendingFolders =
    Number(pendingFolders[0]?.pending_folders ?? 0) || 0;

  return result;
}
