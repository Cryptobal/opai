import { extractStorageKeyFromPublicUrl } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { readsUnified } from "@/lib/docs/migration";
import { enqueueDriveExport } from "./drive-outbox";
import { DrivePathsV2, safeSegment } from "./drive-tree";

async function structureVersion(tenantId: string): Promise<number> {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
    select: { structureVersion: true },
  });
  return ws?.structureVersion ?? 1;
}

/** Carpeta canónica Drive según enlace owner. Nunca lanza. */
export async function enqueueDocumentoPersonaToDrive(params: {
  tenantId: string;
  guardiaId: string;
  documentoId: string;
}): Promise<void> {
  try {
    if (await readsUnified(params.tenantId)) {
      const link = await prisma.documentoEnlace.findFirst({
        where: {
          tenantId: params.tenantId,
          fileId: params.documentoId,
          role: "owner",
          entityType: "guardia",
          entityId: params.guardiaId,
        },
        include: { file: true },
      });
      if (!link?.file.storageKey && !link?.file.fileUrl) return;
      const r2Key =
        link.file.storageKey ||
        (link.file.fileUrl
          ? extractStorageKeyFromPublicUrl(link.file.fileUrl)
          : null);
      if (!r2Key) return;
      await mirrorTrabajador(params.tenantId, params.guardiaId, {
        id: params.documentoId,
        r2Key,
        fileName: link.file.fileName,
        mimeType: link.file.mimeType,
      });
      return;
    }

    const doc = await prisma.opsDocumentoPersona.findFirst({
      where: {
        id: params.documentoId,
        tenantId: params.tenantId,
        guardiaId: params.guardiaId,
      },
      select: { fileUrl: true, fileName: true, mimeType: true },
    });
    if (!doc?.fileUrl) return;
    const r2Key = extractStorageKeyFromPublicUrl(doc.fileUrl);
    if (!r2Key) return;
    await mirrorTrabajador(params.tenantId, params.guardiaId, {
      id: params.documentoId,
      r2Key,
      fileName: doc.fileName || "documento.pdf",
      mimeType: doc.mimeType,
    });
  } catch (err) {
    console.warn("[drive-mirror] enqueueDocumentoPersonaToDrive falló:", err);
  }
}

async function mirrorTrabajador(
  tenantId: string,
  guardiaId: string,
  file: { id: string; r2Key: string; fileName: string; mimeType: string | null }
) {
  if ((await structureVersion(tenantId)) < 2) return;
  const guardia = await prisma.opsGuardia.findFirst({
    where: { id: guardiaId, tenantId },
    select: {
      persona: { select: { rut: true, firstName: true, lastName: true } },
    },
  });
  const rut = guardia?.persona?.rut?.trim() || "SIN-RUT";
  const nombre =
    `${guardia?.persona?.lastName ?? ""} ${guardia?.persona?.firstName ?? ""}`.trim();
  const label = safeSegment(nombre ? `${rut} — ${nombre}` : rut, guardiaId);
  await enqueueDriveExport({
    tenantId,
    docType: "trabajadores",
    sourceType: "ops_documento_persona",
    sourceId: file.id,
    r2Key: file.r2Key,
    fileName: file.fileName,
    mimeType: file.mimeType,
    targetPath: DrivePathsV2.trabajador(label),
  });
}

/** Espejo operacional: carpeta canónica por owner. Nunca lanza. */
export async function enqueueDocOperacionalToDrive(params: {
  tenantId: string;
  documentoId: string;
}): Promise<void> {
  try {
    if (await readsUnified(params.tenantId)) {
      const link = await prisma.documentoEnlace.findFirst({
        where: {
          tenantId: params.tenantId,
          fileId: params.documentoId,
          role: "owner",
        },
        include: { file: true },
      });
      if (!link?.file.storageKey) return;
      if ((await structureVersion(params.tenantId)) < 2) return;
      let path = DrivePathsV2.opsGeneral();
      if (link.entityType === "instalacion") {
        const inst = await prisma.crmInstallation.findFirst({
          where: { id: link.entityId, tenantId: params.tenantId },
          select: { name: true },
        });
        if (inst) {
          path = DrivePathsV2.opsInstallation(
            safeSegment(inst.name, link.entityId)
          );
        }
      }
      await enqueueDriveExport({
        tenantId: params.tenantId,
        docType: "ops_documentos",
        sourceType: "doc_operacional",
        sourceId: params.documentoId,
        r2Key: link.file.storageKey,
        fileName: link.file.fileName,
        mimeType: link.file.mimeType,
        targetPath: path,
      });
      return;
    }

    const doc = await prisma.docOperacional.findFirst({
      where: { id: params.documentoId, tenantId: params.tenantId },
      select: {
        storageKey: true,
        fileName: true,
        mimeType: true,
        capa: true,
        installationId: true,
        installation: { select: { name: true } },
      },
    });
    if (!doc?.storageKey) return;
    if ((await structureVersion(params.tenantId)) < 2) return;
    const path =
      doc.capa === "instalacion" && doc.installation
        ? DrivePathsV2.opsInstallation(
            safeSegment(doc.installation.name, doc.installationId || "inst")
          )
        : DrivePathsV2.opsGeneral();
    await enqueueDriveExport({
      tenantId: params.tenantId,
      docType: "ops_documentos",
      sourceType: "doc_operacional",
      sourceId: params.documentoId,
      r2Key: doc.storageKey,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      targetPath: path,
    });
  } catch (err) {
    console.warn("[drive-mirror] enqueueDocOperacionalToDrive falló:", err);
  }
}
