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
  reason?: "sin_carpeta" | "sin_archivos_elegibles" | "scope_limitado";
};

/**
 * Import Drive → OPAI de los documentos de la carpeta Drive del negocio
 * (espejo inverso de `ensureDealDriveFolderAndBackfill`). Dedupe anti-loop:
 * excluye lo que OPAI ya exportó (DriveExportOutbox.driveFileId) y lo ya
 * importado (CrmFile.driveFileId).
 *
 * Con scope `drive.file`, los archivos subidos manualmente en la UI de Drive
 * no son visibles → reason `scope_limitado` cuando la carpeta existe pero
 * files.list no devuelve nada nuevo.
 */
export async function importDealFilesFromDrive(
  tenantId: string,
  dealId: string,
): Promise<DriveImportResult> {
  const target = await resolveCrmFileTarget(tenantId, "deal", dealId);
  if (!target) return { imported: 0, skipped: 0, total: 0, reason: "sin_carpeta" };

  // Preferir resolución por entityId (sobrevive renombres de pathKey)
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
