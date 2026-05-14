/**
 * POST /api/finance/billing/received/[id]/attach-xml
 *
 * Sube el XML firmado de un DTE RECIBIDO (factura de compra) que el
 * proveedor envió por email, fax o canal manual. Caso de uso típico:
 * SimpleAPI RCV trajo el cabezal (sync mensual) pero las líneas / detalle
 * del documento no — porque el endpoint `/rcv/compras/{mes}/{anio}` solo
 * devuelve resúmenes, no `<Detalle>`. Subiendo el XML completo:
 *   1. Se persiste como bytes en `FinanceDte.dteXml` (para tenerlo guardado).
 *   2. Se sube a R2 como `FinanceDteAttachment` kind=XML.
 *   3. Si el DTE no tenía líneas, se backfillean desde el bloque <Detalle>.
 *
 * Validaciones críticas (defienden de subir XML de otra factura):
 *   - El XML debe parsear como DTE válido (estructura SII).
 *   - tipoDte, folio, RUT emisor, RUT receptor y total DEBEN coincidir
 *     con el DTE de BD. Si difieren, se rechaza con mensaje claro.
 *
 * Mismo patrón que `/api/finance/billing/issued/[id]/attach-xml` (que
 * existe para DTE emitidos legacy sin XML local). Acá la diferencia es
 * que el receptor del XML debe ser el tenant (no el emisor).
 *
 * Permiso: facturacion_view (lectura del DTE recibido es suficiente — no
 * estamos modificando datos contables del cabezal, solo enriqueciendo).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { extractDteIdentity, extractDteLines } from "@/lib/dte-xml-parser";

/** Normaliza un RUT chileno para comparar (ej: "76.123.456-7" → "761234567"). */
function normalizeRut(rut: string | null | undefined): string {
  return (rut ?? "").replace(/[.\-\s]/g, "").toUpperCase();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para adjuntar XML" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const dte = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId, direction: "RECEIVED" },
      select: {
        id: true,
        dteType: true,
        folio: true,
        issuerRut: true,
        receiverRut: true,
        totalAmount: true,
        dteXml: true,
        code: true,
        _count: { select: { lines: true } },
      },
    });
    if (!dte) {
      return NextResponse.json(
        { success: false, error: "DTE recibido no encontrado" },
        { status: 404 },
      );
    }

    // Aceptamos multipart/form-data (upload desde browser) y JSON con
    // { xml: "<contenido>" } para testing por curl.
    const contentType = request.headers.get("content-type") ?? "";
    let xmlText = "";
    let filename = `dte-${dte.dteType}-${dte.folio}.xml`;

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { xml?: string; filename?: string };
      xmlText = (body.xml ?? "").trim();
      if (body.filename) filename = body.filename;
    } else if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      const form = await request.formData();
      const file = form.get("file");
      if (file instanceof File) {
        xmlText = (await file.text()).trim();
        if (file.name) filename = file.name;
      } else {
        const xmlField = form.get("xml");
        if (typeof xmlField === "string") xmlText = xmlField.trim();
      }
    } else {
      xmlText = (await request.text()).trim();
    }

    if (!xmlText) {
      return NextResponse.json(
        { success: false, error: "No se recibió contenido XML" },
        { status: 400 },
      );
    }
    if (xmlText.length > 2_000_000) {
      return NextResponse.json(
        { success: false, error: "XML demasiado grande (máximo 2 MB)" },
        { status: 413 },
      );
    }

    let identity;
    try {
      identity = extractDteIdentity(Buffer.from(xmlText, "utf-8"));
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: `XML no parsea como DTE válido: ${(err as Error).message}`,
        },
        { status: 400 },
      );
    }

    // ── Validaciones de coincidencia: el XML debe ser EXACTAMENTE este DTE ──
    const mismatches: string[] = [];
    if (identity.tipoDte !== dte.dteType) {
      mismatches.push(`tipo DTE (XML=${identity.tipoDte}, DB=${dte.dteType})`);
    }
    if (identity.folio !== dte.folio) {
      mismatches.push(`folio (XML=${identity.folio}, DB=${dte.folio})`);
    }
    if (normalizeRut(identity.rutEmisor) !== normalizeRut(dte.issuerRut)) {
      mismatches.push(
        `RUT emisor (XML=${identity.rutEmisor}, DB=${dte.issuerRut})`,
      );
    }
    if (normalizeRut(identity.rutReceptor) !== normalizeRut(dte.receiverRut)) {
      mismatches.push(
        `RUT receptor (XML=${identity.rutReceptor}, DB=${dte.receiverRut})`,
      );
    }
    // Tolerancia de $1 por redondeos legacy. Si el cabezal de RCV vino con
    // total y el XML difiere, lo logueamos en mismatches pero NO bloqueamos
    // — el XML es la fuente de verdad. (En la práctica esto pasa cuando
    // SimpleAPI redondea distinto que el SII original.)
    const totalDiff = Math.abs(identity.total - Number(dte.totalAmount));
    if (totalDiff > 1) {
      mismatches.push(
        `total (XML=$${identity.total.toLocaleString("es-CL")}, DB=$${Number(dte.totalAmount).toLocaleString("es-CL")})`,
      );
    }
    if (mismatches.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `El XML no coincide con este DTE. Diferencias: ${mismatches.join(", ")}. Verificá que sea el XML correcto.`,
        },
        { status: 400 },
      );
    }

    // Backfill de líneas desde <Detalle> si el DTE no tenía (caso típico
    // de RCV con cabezal solo). Si ya tiene líneas (ej. otro upload manual
    // previo), no las pisamos.
    let linesToCreate: ReturnType<typeof extractDteLines> = [];
    if (dte._count.lines === 0) {
      try {
        linesToCreate = extractDteLines(Buffer.from(xmlText, "utf-8")).filter(
          (l) => l.itemName.trim().length > 0,
        );
      } catch (err) {
        console.warn(
          `[Finance/Billing] received attach-xml: no se pudieron extraer líneas (DTE ${dte.code}): ${(err as Error).message}`,
        );
      }
    }

    const xmlBuffer = Buffer.from(xmlText, "utf-8");

    // Subir a R2 + persistir bytes en BD + crear líneas. Si el DTE ya
    // tenía dteXml (subido previamente), lo pisamos — la validación de
    // identity garantiza que es el mismo DTE.
    await prisma.financeDte.update({
      where: { id: dte.id },
      data: {
        dteXml: new Uint8Array(xmlBuffer),
        ...(linesToCreate.length > 0
          ? {
              lines: {
                create: linesToCreate.map((l) => ({
                  lineNumber: l.lineNumber,
                  itemCode: l.itemCode,
                  itemName: l.itemName,
                  description: l.description,
                  quantity: l.quantity,
                  unit: l.unit,
                  unitPrice: l.unitPrice,
                  netAmount: l.netAmount,
                  isExempt: l.isExempt,
                })),
              },
            }
          : {}),
      },
    });

    // Adjuntar archivo (idempotente por filename). Si ya existe el mismo
    // filename para este DTE, skipeamos el upload — el dteXml ya quedó
    // actualizado arriba.
    const existing = await prisma.financeDteAttachment.findFirst({
      where: { dteId: dte.id, kind: "XML", filename },
      select: { id: true },
    });
    if (!existing) {
      const uploaded = await uploadFile(
        xmlBuffer,
        filename,
        "application/xml",
        "finance",
        ctx.tenantId,
      );
      await prisma.financeDteAttachment.create({
        data: {
          tenantId: ctx.tenantId,
          dteId: dte.id,
          kind: "XML",
          filename: uploaded.fileName,
          mimeType: uploaded.mimeType,
          size: uploaded.size,
          storageKey: uploaded.storageKey,
          publicUrl: uploaded.publicUrl || null,
          uploadedBy: ctx.userId,
        },
      });
    }

    try {
      const { logAudit } = await import("@/lib/audit");
      await logAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "UPDATE",
        entity: "FinanceDte",
        entityId: dte.id,
        details: {
          kind: "RECEIVED_DTE_XML_ATTACHED",
          dteType: dte.dteType,
          folio: dte.folio,
          xmlBytes: xmlText.length,
          linesBackfilled: linesToCreate.length,
        },
      });
    } catch {
      // best-effort
    }

    const linesMsg =
      linesToCreate.length > 0
        ? ` Se cargaron ${linesToCreate.length} línea${linesToCreate.length === 1 ? "" : "s"} del detalle.`
        : "";
    return NextResponse.json({
      success: true,
      data: {
        message: `XML adjuntado al DTE ${dte.code}.${linesMsg}`,
        bytes: xmlText.length,
        linesBackfilled: linesToCreate.length,
      },
    });
  } catch (error) {
    console.error("[Finance/Billing] Error attaching received XML:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
