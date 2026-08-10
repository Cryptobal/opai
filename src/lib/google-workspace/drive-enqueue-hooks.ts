import { uploadFile, extractStorageKeyFromPublicUrl } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { enqueueDriveExport } from "./drive-outbox";
import { resolveCrmFileTarget } from "./drive-crm-target";
import { DrivePathsV1, DrivePathsV2, safeSegment } from "./drive-tree";

async function structureVersion(tenantId: string): Promise<number> {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
    select: { structureVersion: true },
  });
  return ws?.structureVersion ?? 1;
}

/**
 * Espeja a Drive un archivo YA subido a R2 (CrmFile) adjunto a una entidad CRM.
 * Solo hacia adelante (sin backfill). Nunca lanza — el mirror no debe romper la
 * subida del archivo.
 */
export async function enqueueCrmFileToDrive(params: {
  tenantId: string;
  entityType: string;
  entityId: string;
  file: { id: string; storageKey: string; fileName: string; mimeType: string };
}): Promise<void> {
  try {
    const target = await resolveCrmFileTarget(params.tenantId, params.entityType, params.entityId);
    if (!target) return;
    await enqueueDriveExport({
      tenantId: params.tenantId,
      docType: target.docType,
      sourceType: `crm_file_${params.entityType}`,
      sourceId: params.file.id,
      r2Key: params.file.storageKey,
      fileName: params.file.fileName,
      mimeType: params.file.mimeType,
      targetPath: target.path,
    });
  } catch (err) {
    console.warn("[drive-mirror] enqueueCrmFileToDrive falló:", err);
  }
}

/** Encola PDF de factura/proforma hacia Drive (nunca lanza). */
export async function enqueueBillingPdfToDrive(params: {
  tenantId: string;
  dteId: string;
  pdfBuffer: Buffer;
  fileName: string;
  accountName?: string | null;
  installationName?: string | null;
}): Promise<void> {
  try {
    const uploaded = await uploadFile(
      params.pdfBuffer,
      params.fileName,
      "application/pdf",
      "drive-mirror",
      params.tenantId,
    );
    const cuenta = safeSegment(params.accountName, "Sin-cuenta");
    const instalacion = safeSegment(params.installationName, "General");
    const v = await structureVersion(params.tenantId);
    const path =
      v >= 2
        ? DrivePathsV2.installationInvoices(cuenta, instalacion)
        : DrivePathsV1.installationInvoices(cuenta, instalacion);
    await enqueueDriveExport({
      tenantId: params.tenantId,
      docType: "factura",
      sourceType: "finance_dte",
      sourceId: params.dteId,
      r2Key: uploaded.storageKey,
      fileName: params.fileName,
      targetPath: path,
    });
  } catch (err) {
    console.warn("[drive-mirror] enqueueBillingPdfToDrive falló:", err);
  }
}

/** Encola PDF de cotización (+ path licitación si aplica). Nunca lanza. */
export async function enqueueQuotePdfToDrive(params: {
  tenantId: string;
  quoteId: string;
  pdfBuffer: Buffer;
  fileName: string;
  accountName?: string | null;
  installationName?: string | null;
  dealId?: string | null;
  dealTitle?: string | null;
  isLicitacion?: boolean;
}): Promise<void> {
  try {
    const uploaded = await uploadFile(
      params.pdfBuffer,
      params.fileName,
      "application/pdf",
      "drive-mirror",
      params.tenantId,
    );
    const cuenta = safeSegment(params.accountName, "Sin-cuenta");
    const instalacion = safeSegment(params.installationName, "General");
    const v = await structureVersion(params.tenantId);
    const quotePath =
      v >= 2
        ? DrivePathsV2.installationQuotes(cuenta, instalacion)
        : DrivePathsV1.installationQuotes(cuenta, instalacion);
    await enqueueDriveExport({
      tenantId: params.tenantId,
      docType: "cotizacion",
      sourceType: "cpq_quote",
      sourceId: params.quoteId,
      r2Key: uploaded.storageKey,
      fileName: params.fileName,
      targetPath: quotePath,
    });

    if (params.isLicitacion) {
      const year = String(new Date().getFullYear());
      const dealName = safeSegment(params.dealTitle, params.quoteId);
      const licPath =
        v >= 2
          ? DrivePathsV2.licitacion(year, dealName)
          : DrivePathsV1.licitacion(year, dealName);
      await enqueueDriveExport({
        tenantId: params.tenantId,
        docType: "licitacion",
        sourceType: "cpq_quote_licitacion",
        sourceId: params.dealId || params.quoteId,
        r2Key: uploaded.storageKey,
        fileName: params.fileName,
        targetPath: licPath,
      });
    }
  } catch (err) {
    console.warn("[drive-mirror] enqueueQuotePdfToDrive falló:", err);
  }
}

/** Espejo de OpsDocumentoPersona → Personas/{RUT} — {Apellido Nombre}/. Nunca lanza. */
export async function enqueueDocumentoPersonaToDrive(params: {
  tenantId: string;
  guardiaId: string;
  documentoId: string;
}): Promise<void> {
  try {
    const doc = await prisma.opsDocumentoPersona.findFirst({
      where: { id: params.documentoId, tenantId: params.tenantId, guardiaId: params.guardiaId },
      select: { fileUrl: true, fileName: true, mimeType: true },
    });
    if (!doc?.fileUrl) return;
    const r2Key = extractStorageKeyFromPublicUrl(doc.fileUrl);
    if (!r2Key) {
      console.warn("[drive-mirror] OpsDocumentoPersona sin r2Key parseable:", params.documentoId);
      return;
    }
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: params.guardiaId, tenantId: params.tenantId },
      select: {
        persona: { select: { rut: true, firstName: true, lastName: true } },
      },
    });
    const rut = guardia?.persona?.rut?.trim() || "SIN-RUT";
    const nombre = `${guardia?.persona?.lastName ?? ""} ${guardia?.persona?.firstName ?? ""}`.trim();
    const label = safeSegment(
      nombre ? `${rut} — ${nombre}` : rut,
      params.guardiaId,
    );
    const v = await structureVersion(params.tenantId);
    if (v < 2) return; // solo en árbol v2
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
    const v = await structureVersion(params.tenantId);
    if (v < 2) return;
    const path =
      doc.capa === "instalacion" && doc.installation
        ? DrivePathsV2.opsInstallation(safeSegment(doc.installation.name, doc.installationId || "inst"))
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
