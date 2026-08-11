import { uploadFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { enqueueDriveExport } from "./drive-outbox";
import { resolveCrmFileTarget } from "./drive-crm-target";
import { DrivePathsV1, DrivePathsV2, safeSegment } from "./drive-tree";

export {
  enqueueDocumentoPersonaToDrive,
  enqueueDocOperacionalToDrive,
} from "./drive-enqueue-ops";

async function structureVersion(tenantId: string): Promise<number> {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
    select: { structureVersion: true },
  });
  return ws?.structureVersion ?? 1;
}

/**
 * Espeja a Drive un archivo YA subido a R2 (Documento) adjunto a una entidad CRM.
 * Solo hacia adelante (sin backfill). Nunca lanza.
 */
export async function enqueueCrmFileToDrive(params: {
  tenantId: string;
  entityType: string;
  entityId: string;
  file: { id: string; storageKey: string | null; fileName: string; mimeType: string };
}): Promise<void> {
  try {
    if (!params.file.storageKey) {
      console.warn("[drive-mirror] enqueueCrmFileToDrive: sin storageKey, se omite espejo");
      return;
    }
    const target = await resolveCrmFileTarget(
      params.tenantId,
      params.entityType,
      params.entityId,
    );
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
