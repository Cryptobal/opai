import { uploadFile } from "@/lib/storage";
import { enqueueDriveExport } from "./drive-outbox";
import { resolveCrmFileTarget } from "./drive-crm-target";

function safeSegment(name: string | null | undefined, fallback: string): string {
  const raw = (name || fallback).trim() || fallback;
  return raw.replace(/[\\/]/g, "-").slice(0, 80);
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
    if (!target) return; // entidad no espejada (lead/guardia) o inexistente
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
    await enqueueDriveExport({
      tenantId: params.tenantId,
      docType: "factura",
      sourceType: "finance_dte",
      sourceId: params.dteId,
      r2Key: uploaded.storageKey,
      fileName: params.fileName,
      targetPath: `Clientes/${cuenta}/${instalacion}/Facturas`,
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
    await enqueueDriveExport({
      tenantId: params.tenantId,
      docType: "cotizacion",
      sourceType: "cpq_quote",
      sourceId: params.quoteId,
      r2Key: uploaded.storageKey,
      fileName: params.fileName,
      targetPath: `Clientes/${cuenta}/${instalacion}/Cotizaciones`,
    });

    if (params.isLicitacion) {
      const year = String(new Date().getFullYear());
      const dealName = safeSegment(params.dealTitle, params.quoteId);
      await enqueueDriveExport({
        tenantId: params.tenantId,
        docType: "licitacion",
        sourceType: "cpq_quote_licitacion",
        sourceId: params.dealId || params.quoteId,
        r2Key: uploaded.storageKey,
        fileName: params.fileName,
        targetPath: `Licitaciones/${year}/${dealName}`,
      });
    }
  } catch (err) {
    console.warn("[drive-mirror] enqueueQuotePdfToDrive falló:", err);
  }
}
