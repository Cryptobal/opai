import { extractStorageKeyFromPublicUrl } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { enqueueDriveExport } from "./drive-outbox";
import { DrivePathsV2, safeSegment } from "./drive-tree";

async function structureVersion(tenantId: string): Promise<number> {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
    select: { structureVersion: true },
  });
  return ws?.structureVersion ?? 1;
}

/** Espejo de OpsDocumentoPersona → Personas/{RUT} — {Apellido Nombre}/. Nunca lanza. */
export async function enqueueDocumentoPersonaToDrive(params: {
  tenantId: string;
  guardiaId: string;
  documentoId: string;
}): Promise<void> {
  try {
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
    if (!r2Key) {
      console.warn(
        "[drive-mirror] OpsDocumentoPersona sin r2Key parseable:",
        params.documentoId,
      );
      return;
    }
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: params.guardiaId, tenantId: params.tenantId },
      select: {
        persona: { select: { rut: true, firstName: true, lastName: true } },
      },
    });
    const rut = guardia?.persona?.rut?.trim() || "SIN-RUT";
    const nombre =
      `${guardia?.persona?.lastName ?? ""} ${guardia?.persona?.firstName ?? ""}`.trim();
    const label = safeSegment(nombre ? `${rut} — ${nombre}` : rut, params.guardiaId);
    if ((await structureVersion(params.tenantId)) < 2) return;
    await enqueueDriveExport({
      tenantId: params.tenantId,
      docType: "trabajadores",
      sourceType: "ops_documento_persona",
      sourceId: params.documentoId,
      r2Key,
      fileName: doc.fileName || "documento.pdf",
      mimeType: doc.mimeType,
      targetPath: DrivePathsV2.trabajador(label),
    });
  } catch (err) {
    console.warn("[drive-mirror] enqueueDocumentoPersonaToDrive falló:", err);
  }
}

/** Espejo de DocOperacional → Operaciones/…. Nunca lanza. */
export async function enqueueDocOperacionalToDrive(params: {
  tenantId: string;
  documentoId: string;
}): Promise<void> {
  try {
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
            safeSegment(doc.installation.name, doc.installationId || "inst"),
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
