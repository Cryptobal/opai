/**
 * POST /api/finance/factoring/extract-simulation
 *
 * Recibe un PDF (multipart/form-data, field "file") con la simulación
 * que envió la empresa de factoring. Lo sube a R2 y luego lo manda al
 * proveedor de IA para extraer campos económicos estructurados.
 *
 * Devuelve { fileUrl, fileKey, fileName, extracted, extractionError? }.
 * Si la extracción IA falla por cualquier motivo (provider no
 * configurado, JSON malformado, timeout) devuelve `extracted = null` +
 * `extractionError` con el mensaje — el cliente abre el modal con los
 * campos vacíos para que el usuario los tipee a mano, pero ya con el
 * PDF subido como respaldo. Capability: facturacion_issue.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, resolveApiPerms, unauthorized } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { uploadFile } from "@/lib/storage";
import { extractFactoringSimulation } from "@/modules/finance/factoring/simulation-extraction.service";

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_issue")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para cesiones de factoring" },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Body inválido (esperado multipart/form-data)" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Falta el campo 'file' con el PDF" },
      { status: 400 },
    );
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { success: false, error: "Sólo se aceptan archivos PDF" },
      { status: 400 },
    );
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: `El PDF excede el límite de ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB`,
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Sube el PDF primero — queda como respaldo incluso si la IA falla.
  let storageKey: string;
  let publicUrl: string;
  try {
    const uploaded = await uploadFile(
      buffer,
      file.name,
      "application/pdf",
      "factoring-sims",
      ctx.tenantId,
    );
    storageKey = uploaded.storageKey;
    publicUrl = uploaded.publicUrl;
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error subiendo el PDF a storage",
      },
      { status: 500 },
    );
  }

  // Intenta extraer campos con IA. Si falla, igual devolvemos el archivo
  // subido y dejamos al cliente decidir (modo manual).
  const pdfBase64 = buffer.toString("base64");
  try {
    const extracted = await extractFactoringSimulation(pdfBase64, {
      tenantId: ctx.tenantId,
    });
    return NextResponse.json({
      success: true,
      fileUrl: publicUrl,
      fileKey: storageKey,
      fileName: file.name,
      extracted,
    });
  } catch (err) {
    return NextResponse.json({
      success: true,
      fileUrl: publicUrl,
      fileKey: storageKey,
      fileName: file.name,
      extracted: null,
      extractionError:
        err instanceof Error
          ? err.message
          : "Error desconocido al extraer datos del PDF",
    });
  }
}
