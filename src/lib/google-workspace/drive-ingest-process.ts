import { prisma } from "@/lib/prisma";
import { uploadFile, STORAGE_PROVIDER } from "@/lib/storage";
import { resolveEntityFromFolderId } from "./drive-tree";
import { downloadDriveFile } from "./drive-read.service";
import { resolveCrmFileTarget } from "./drive-crm-target";
import type { DriveChangeItem } from "./drive-changes.service";
import {
  CRM_ENTITIES,
  docTypeModuleEnabled,
  DRIVE_INGEST_MAX_BYTES,
  FOLDER_MIME,
  ignoreIngestedFile,
  isKnownDriveFile,
  SHORTCUT_MIME,
} from "./drive-ingest-helpers";

export async function processDriveChange(
  tenantId: string,
  ch: DriveChangeItem,
  mirror: Record<string, boolean>,
  enabled: Set<string>,
): Promise<"ingested" | "ignored" | "error" | "skip"> {
  if (ch.removed || !ch.file || ch.file.trashed) return "skip";
  if (ch.file.mimeType === FOLDER_MIME || ch.file.mimeType === SHORTCUT_MIME) {
    return "skip";
  }

  const known = await isKnownDriveFile(tenantId, ch.fileId);
  if (known === "ingested") return "skip";
  if (known === "outbox") {
    await ignoreIngestedFile({
      tenantId,
      driveFileId: ch.fileId,
      fileName: ch.file.name,
      mimeType: ch.file.mimeType,
      sizeBytes: ch.file.size,
      reason: "exportado_por_opai",
    });
    return "ignored";
  }

  const parentId = ch.file.parents[0] ?? null;
  const entity = parentId
    ? await resolveEntityFromFolderId(tenantId, parentId)
    : null;
  if (!entity) {
    await ignoreIngestedFile({
      tenantId,
      driveFileId: ch.fileId,
      fileName: ch.file.name,
      mimeType: ch.file.mimeType,
      sizeBytes: ch.file.size,
      driveFolderId: parentId,
      reason: "carpeta_desconocida",
    });
    return "ignored";
  }

  if (!CRM_ENTITIES.has(entity.entityType)) {
    await ignoreIngestedFile({
      tenantId,
      driveFileId: ch.fileId,
      fileName: ch.file.name,
      mimeType: ch.file.mimeType,
      sizeBytes: ch.file.size,
      driveFolderId: parentId,
      entityType: entity.entityType,
      entityId: entity.entityId,
      reason: "modulo_no_habilitado",
    });
    return "ignored";
  }

  const target = await resolveCrmFileTarget(
    tenantId,
    entity.entityType,
    entity.entityId,
  );
  if (!docTypeModuleEnabled(target?.docType, mirror, enabled)) {
    await ignoreIngestedFile({
      tenantId,
      driveFileId: ch.fileId,
      fileName: ch.file.name,
      mimeType: ch.file.mimeType,
      sizeBytes: ch.file.size,
      driveFolderId: parentId,
      entityType: entity.entityType,
      entityId: entity.entityId,
      reason: "modulo_no_habilitado",
    });
    return "ignored";
  }

  if (ch.file.size != null && ch.file.size > DRIVE_INGEST_MAX_BYTES) {
    await ignoreIngestedFile({
      tenantId,
      driveFileId: ch.fileId,
      fileName: ch.file.name,
      mimeType: ch.file.mimeType,
      sizeBytes: ch.file.size,
      driveFolderId: parentId,
      reason: "demasiado_grande",
    });
    return "ignored";
  }

  try {
    const dl = await downloadDriveFile(tenantId, {
      id: ch.file.id,
      name: ch.file.name,
      mimeType: ch.file.mimeType || "application/octet-stream",
    });
    if (!dl) throw new Error("download null");
    const up = await uploadFile(dl.buffer, dl.fileName, dl.mimeType, "crm", tenantId);
    const documento = await prisma.documento.create({
      data: {
        tenantId,
        fileName: up.fileName,
        mimeType: up.mimeType,
        size: up.size,
        storageProvider: STORAGE_PROVIDER,
        storageKey: up.storageKey,
        driveFileId: ch.fileId,
        createdBy: null,
      },
    });
    await prisma.documentoEnlace.create({
      data: {
        tenantId,
        fileId: documento.id,
        entityType: entity.entityType,
        entityId: entity.entityId,
        folderId: null,
      },
    });
    await prisma.driveIngestedFile.create({
      data: {
        tenantId,
        driveFileId: ch.fileId,
        driveFolderId: parentId,
        fileName: ch.file.name,
        mimeType: ch.file.mimeType,
        sizeBytes: ch.file.size,
        entityType: entity.entityType,
        entityId: entity.entityId,
        storageKey: up.storageKey,
        targetTable: "crm_file",
        targetId: documento.id,
        status: "INGESTED",
        ingestedAt: new Date(),
      },
    });
    return "ingested";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.driveIngestedFile.upsert({
      where: { tenantId_driveFileId: { tenantId, driveFileId: ch.fileId } },
      create: {
        tenantId,
        driveFileId: ch.fileId,
        driveFolderId: parentId,
        fileName: ch.file.name,
        mimeType: ch.file.mimeType,
        sizeBytes: ch.file.size,
        entityType: entity.entityType,
        entityId: entity.entityId,
        status: "ERROR",
        attempts: 1,
        lastError: msg.slice(0, 500),
      },
      update: {
        status: "ERROR",
        attempts: { increment: 1 },
        lastError: msg.slice(0, 500),
      },
    });
    return "error";
  }
}
