import { prisma } from "@/lib/prisma";
import { uploadFile, STORAGE_PROVIDER } from "@/lib/storage";
import { resolveCrmFileTarget } from "./drive-crm-target";
import { listDriveFolderFiles, downloadDriveFile } from "./drive-read.service";

const IMPORT_CAP = 15;
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

export type DriveImportResult = {
  imported: number;
  skipped: number;
  total: number;
  reason?: "sin_carpeta";
};

/**
 * Import Drive → OPAI de los documentos de la carpeta Drive del negocio
 * (espejo inverso de `ensureDealDriveFolderAndBackfill`). Dedupe anti-loop:
 * excluye lo que OPAI ya exportó (DriveExportOutbox.driveFileId) y lo ya
 * importado (CrmFile.driveFileId).
 */
export async function importDealFilesFromDrive(
  tenantId: string,
  dealId: string,
): Promise<DriveImportResult> {
  const target = await resolveCrmFileTarget(tenantId, "deal", dealId);
  if (!target) return { imported: 0, skipped: 0, total: 0, reason: "sin_carpeta" };
  const cached = await prisma.driveFolderCache.findUnique({
    where: { tenantId_pathKey: { tenantId, pathKey: target.path } },
  });
  if (!cached) return { imported: 0, skipped: 0, total: 0, reason: "sin_carpeta" };

  const files = await listDriveFolderFiles(tenantId, cached.driveFolderId);
  if (files.length === 0) return { imported: 0, skipped: 0, total: 0 };

  const driveIds = files.map((f) => f.id);
  const [exported, importedRows] = await Promise.all([
    prisma.driveExportOutbox.findMany({
      where: { tenantId, driveFileId: { in: driveIds } },
      select: { driveFileId: true },
    }),
    prisma.crmFile.findMany({
      where: { tenantId, driveFileId: { in: driveIds } },
      select: { driveFileId: true },
    }),
  ]);
  const known = new Set<string>();
  for (const r of [...exported, ...importedRows]) {
    if (r.driveFileId) known.add(r.driveFileId);
  }

  const fresh = files.filter((f) => !known.has(f.id));
  let imported = 0;
  let skipped = fresh.length > IMPORT_CAP ? fresh.length - IMPORT_CAP : 0;

  for (const f of fresh.slice(0, IMPORT_CAP)) {
    try {
      if (f.size != null && f.size > MAX_SIZE_BYTES) {
        skipped += 1;
        continue;
      }
      const dl = await downloadDriveFile(tenantId, f);
      if (!dl) {
        skipped += 1;
        continue;
      }
      const up = await uploadFile(dl.buffer, dl.fileName, dl.mimeType, "crm", tenantId);
      const crmFile = await prisma.crmFile.create({
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
      await prisma.crmFileLink.create({
        data: { tenantId, fileId: crmFile.id, entityType: "deal", entityId: dealId, folderId: null },
      });
      imported += 1;
    } catch (err) {
      console.warn("[drive] importDealFilesFromDrive:", f.id, err);
      skipped += 1;
    }
  }

  return { imported, skipped, total: files.length };
}
