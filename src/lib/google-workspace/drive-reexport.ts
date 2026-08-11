import { prisma } from "@/lib/prisma";
import { ensureFolderPath } from "./drive.service";
import { enqueueDriveExport } from "./drive-outbox";
import { BACKFILL_SOURCES } from "./drive-backfill-sources";
import { resolveCrmFileTarget } from "./drive-crm-target";
import { withDriveBackoff } from "./drive-migrate-roots";
import { clearPendingCountsCache } from "./drive-pending-counts";
import { pathSegments } from "./drive-tree";
import {
  SUPPORTED_DOC_TYPES,
  type SupportedDocType,
} from "./drive-mirror-config";

const DEFAULT_LIMIT = 500;

export type BackfillResult = {
  queued: number;
  skipped: number;
  remaining: number;
  foldersCreated?: number;
};

function isSupportedDocType(v: string): v is SupportedDocType {
  return (SUPPORTED_DOC_TYPES as readonly string[]).includes(v);
}

/**
 * Backfill por tipo: encola hasta `limit` docs pendientes en DriveExportOutbox.
 * Dedupe: no encola si ya hay PENDING o SENT con el mismo sourceType+sourceId.
 */
export async function backfillDocType(
  tenantId: string,
  docType: SupportedDocType,
  limit = DEFAULT_LIMIT,
): Promise<BackfillResult> {
  let foldersCreated = 0;
  if (docType === "licitacion") {
    foldersCreated = await backfillLicitacionFolders(tenantId, limit);
  }

  const source = BACKFILL_SOURCES[docType];
  const page = await source.listPending(tenantId, limit);
  let queued = 0;
  let skipped = page.skipped;

  const existing =
    page.items.length === 0
      ? []
      : await prisma.driveExportOutbox.findMany({
          where: {
            tenantId,
            status: { in: ["PENDING", "SENT"] },
            OR: page.items.map((i) => ({
              sourceType: i.sourceType,
              sourceId: i.sourceId,
            })),
          },
          select: { sourceType: true, sourceId: true },
        });
  const existingKeys = new Set(
    existing.map((e) => `${e.sourceType}:${e.sourceId}`),
  );

  for (const item of page.items) {
    if (existingKeys.has(`${item.sourceType}:${item.sourceId}`)) {
      skipped += 1;
      continue;
    }

    const id = await enqueueDriveExport({
      tenantId,
      docType,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      r2Key: item.r2Key,
      fileName: item.fileName,
      mimeType: item.mimeType,
      targetPath: item.targetPath,
    });
    if (id) queued += 1;
    else skipped += 1;
  }

  clearPendingCountsCache(tenantId);
  return {
    queued,
    skipped,
    remaining: page.nextCursor ? 1 : 0,
    ...(docType === "licitacion" ? { foldersCreated } : {}),
  };
}

async function backfillLicitacionFolders(
  tenantId: string,
  limit: number,
): Promise<number> {
  const deals = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT d.id::text AS id
    FROM crm.deals d
    WHERE d.tenant_id = ${tenantId}
      AND d.is_licitacion = true
      AND NOT EXISTS (
        SELECT 1 FROM drive_folder_cache c
        WHERE c.tenant_id = d.tenant_id
          AND c.entity_type = 'deal'
          AND c.entity_id = d.id::text
      )
    ORDER BY d.id ASC
    LIMIT ${limit}
  `;

  let created = 0;
  for (const deal of deals) {
    const target = await resolveCrmFileTarget(tenantId, "deal", deal.id);
    if (!target) continue;
    const segments = pathSegments(target.path);
    await withDriveBackoff(() =>
      ensureFolderPath(tenantId, segments, {
        entity: { type: "deal", id: deal.id },
        leafName: segments[segments.length - 1],
      }),
    );
    created += 1;
  }
  return created;
}

/**
 * @deprecated Preferir `backfillDocType`. Recorre tipos CRM históricos.
 */
export async function reexportTenantDriveFromR2(
  tenantId: string,
  _cursor?: string | null,
): Promise<{ queued: number; remaining: boolean; nextCursor: string | null }> {
  const types: SupportedDocType[] = [
    "negocios",
    "licitacion",
    "personas",
    "documentos",
    "leads",
  ];
  let queued = 0;
  let remaining = false;
  for (const dt of types) {
    if (!isSupportedDocType(dt)) continue;
    const r = await backfillDocType(tenantId, dt, DEFAULT_LIMIT);
    queued += r.queued;
    if (r.remaining > 0) remaining = true;
  }
  return { queued, remaining, nextCursor: null };
}
