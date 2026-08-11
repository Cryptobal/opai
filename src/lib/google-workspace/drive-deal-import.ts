import { prisma } from "@/lib/prisma";
import { uploadFile, STORAGE_PROVIDER } from "@/lib/storage";
import { resolveCrmFileTarget } from "./drive-crm-target";
import { listDriveFolderFiles, downloadDriveFile } from "./drive-read.service";
import { ingestDealFolderFromDrive } from "./drive-ingest.service";
import { DRIVE_INGEST_MAX_BYTES } from "./drive-ingest-helpers";

const IMPORT_CAP = 15;

export type DriveImportResult = {
  imported: number;
  skipped: number;
  total: number;
  reason?: "sin_carpeta" | "sin_archivos_elegibles" | "scope_limitado";
};

/**
 * Import Drive → OPAI. En SHARED_DRIVE delega en Changes API (ingesta).
 * En OAUTH: listado local con limitación drive.file.
 */
export async function importDealFilesFromDrive(
  tenantId: string,
  dealId: string,
): Promise<DriveImportResult> {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
    select: { mode: true },
  });
  if (ws?.mode === "SHARED_DRIVE") {
    const r = await ingestDealFolderFromDrive(tenantId, dealId);
    return {
      imported: r.ingested,
      skipped: r.ignored + r.errors,
      total: r.processed,
    };
  }

  const target = await resolveCrmFileTarget(tenantId, "deal", dealId);
  if (!target) return { imported: 0, skipped: 0, total: 0, reason: "sin_carpeta" };

  const byEntity = await prisma.driveFolderCache.findFirst({
    where: { tenantId, entityType: "deal", entityId: dealId },
    orderBy: { createdAt: "asc" },
  });
  const cached =
    byEntity ??
    (await prisma.driveFolderCache.findUnique({
      where: { tenantId_pathKey: { tenantId, pathKey: target.path } },
    }));
  if (!cached) return { imported: 0, skipped: 0, total: 0, reason: "sin_carpeta" };

  const files = await listDriveFolderFiles(tenantId, cached.driveFolderId);
  if (files.length === 0) {
    return { imported: 0, skipped: 0, total: 0, reason: "scope_limitado" };
  }

  const driveIds = files.map((f) => f.id);
  const [exported, importedRows] = await Promise.all([
    prisma.driveExportOutbox.findMany({
      where: { tenantId, driveFileId: { in: driveIds } },
      select: { driveFileId: true },
    }),
    prisma.documento.findMany({
      where: { tenantId, driveFileId: { in: driveIds } },
      select: { driveFileId: true },
    }),
  ]);
  const known = new Set<string>();
  for (const r of [...exported, ...importedRows]) {
    if (r.driveFileId) known.add(r.driveFileId);
  }

  const fresh = files.filter((f) => !known.has(f.id));
  if (fresh.length === 0) {
    return {
      imported: 0,
      skipped: files.length,
      total: files.length,
      reason: "sin_archivos_elegibles",
    };
  }

  let imported = 0;
  let skipped = fresh.length > IMPORT_CAP ? fresh.length - IMPORT_CAP : 0;

  for (const f of fresh.slice(0, IMPORT_CAP)) {
    try {
      if (f.size != null && f.size > DRIVE_INGEST_MAX_BYTES) {
        skipped += 1;
        continue;
      }
      const dl = await downloadDriveFile(tenantId, f);
      if (!dl) {
        skipped += 1;
        continue;
      }
      const up = await uploadFile(dl.buffer, dl.fileName, dl.mimeType, "crm", tenantId);
      const documento = await prisma.documento.create({
        data: {
          tenantId,
          fileName: up.fileName,
          mimeType: up.mimeType,
          size: up.size,
          storageProvider: STORAGE_PROVIDER,
          storageKey: up.storageKey,
          driveFileId: f.id,
          createdBy: null,
        },
      });
      await prisma.documentoEnlace.create({
        data: {
          tenantId,
          fileId: documento.id,
          entityType: "deal",
          entityId: dealId,
          folderId: null,
        },
      });
      imported += 1;
    } catch (err) {
      console.warn("[drive] importDealFilesFromDrive:", f.id, err);
      skipped += 1;
    }
  }

  return { imported, skipped, total: files.length };
}
