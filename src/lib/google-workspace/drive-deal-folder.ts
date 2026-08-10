import { prisma } from "@/lib/prisma";
import { ensureFolderPath, uploadR2ToDrive } from "./drive.service";
import { resolveCrmFileTarget } from "./drive-crm-target";
import { pathSegments } from "./drive-tree";

const SOURCE_TYPE = "crm_file_deal";

async function assertDriveActive(tenantId: string) {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
  });
  if (!ws) throw new Error("Google Drive no está conectado");
  return ws;
}

async function resolveDealTarget(tenantId: string, dealId: string) {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { id: true },
  });
  if (!deal) throw new Error("Negocio no encontrado");
  const target = await resolveCrmFileTarget(tenantId, "deal", dealId);
  if (!target) throw new Error("No se pudo resolver la carpeta del negocio");
  return target;
}

export async function getDealDriveFolderStatus(tenantId: string, dealId: string) {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
  });
  const connected = !!ws;

  let path: string | null = null;
  let hasFolder = false;
  let folderId: string | null = null;

  try {
    const target = await resolveDealTarget(tenantId, dealId);
    path = target.path;
    const byEntity = await prisma.driveFolderCache.findFirst({
      where: { tenantId, entityType: "deal", entityId: dealId },
      orderBy: { createdAt: "asc" },
    });
    const cached =
      byEntity ??
      (await prisma.driveFolderCache.findUnique({
        where: { tenantId_pathKey: { tenantId, pathKey: path } },
      }));
    if (cached) {
      hasFolder = true;
      folderId = cached.driveFolderId;
    }
  } catch {
    /* deal missing — status still returns connected + fileCount */
  }

  const fileCount = await prisma.crmFileLink.count({
    where: { tenantId, entityType: "deal", entityId: dealId },
  });

  return {
    connected,
    hasFolder,
    folderId,
    folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
    path,
    fileCount,
  };
}

/**
 * Crea de inmediato la carpeta Drive de una licitación (sin esperar documentos).
 * Nunca lanza — el espejo no debe romper el CRUD del negocio.
 */
export async function ensureLicitacionDriveFolder(
  tenantId: string,
  dealId: string,
): Promise<void> {
  try {
    const ws = await prisma.googleDriveWorkspace.findFirst({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!ws) return;
    const deal = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId, isLicitacion: true },
      select: { id: true },
    });
    if (!deal) return;
    const target = await resolveCrmFileTarget(tenantId, "deal", dealId);
    if (!target) return;
    const segments = pathSegments(target.path);
    await ensureFolderPath(tenantId, segments, {
      entity: { type: "deal", id: dealId },
      leafName: segments[segments.length - 1],
    });
  } catch (err) {
    console.warn("[drive-deal-folder] ensureLicitacionDriveFolder:", dealId, err);
  }
}

export async function ensureDealDriveFolderAndBackfill(tenantId: string, dealId: string) {
  await assertDriveActive(tenantId);
  const target = await resolveDealTarget(tenantId, dealId);
  const segments = pathSegments(target.path);

  const entity = { type: "deal", id: dealId };
  const folderId = await ensureFolderPath(tenantId, segments, {
    entity,
    leafName: segments[segments.length - 1],
  });
  if (!folderId) throw new Error("No se pudo crear la carpeta en Google Drive");

  const links = await prisma.crmFileLink.findMany({
    where: { tenantId, entityType: "deal", entityId: dealId },
    include: { file: true },
  });

  let uploaded = 0;
  let skipped = 0;
  const total = links.length;

  for (const link of links) {
    const file = link.file;
    try {
      const existing = await prisma.driveExportOutbox.findFirst({
        where: {
          tenantId,
          sourceType: SOURCE_TYPE,
          sourceId: file.id,
          status: { in: ["SENT", "PENDING"] },
        },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const driveFileId = await uploadR2ToDrive({
        tenantId,
        r2Key: file.storageKey,
        fileName: file.fileName,
        mimeType: file.mimeType,
        targetSegments: segments,
        entity,
      });
      if (!driveFileId) {
        skipped++;
        continue;
      }

      await prisma.driveExportOutbox.create({
        data: {
          tenantId,
          docType: target.docType,
          sourceType: SOURCE_TYPE,
          sourceId: file.id,
          r2Key: file.storageKey,
          fileName: file.fileName,
          mimeType: file.mimeType,
          targetPath: target.path,
          driveFileId,
          status: "SENT",
          sentAt: new Date(),
        },
      });
      uploaded++;
    } catch (err) {
      console.warn("[drive-deal-folder] backfill file failed:", file.id, err);
      skipped++;
    }
  }

  return {
    folderId,
    folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
    path: target.path,
    uploaded,
    skipped,
    total,
  };
}
