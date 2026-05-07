/**
 * POST /api/finance/billing/issued/[id]/attach-xml
 *
 * Permite subir el XML firmado original de un DTE histórico que no tiene
 * `dteXml` persistido en BD. Caso de uso: facturas emitidas antes del
 * refactor de 2026-05-05 que agregó la persistencia automática del XML
 * tras la emisión. Sin XML local no se puede ceder a factoring (el AEC
 * requiere embeber el DTE original como bytes firmados).
 *
 * Validaciones críticas (defienden de subir XML de otra factura):
 *   - El XML debe parsear como DTE válido (estructura SII).
 *   - tipoDte, folio, RUT emisor, RUT receptor y total DEBEN coincidir
 *     con el DTE de BD. Si difieren, se rechaza con mensaje claro.
 *
 * Permiso: facturacion_issue (mismo nivel que emitir).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { extractDteIdentity } from "@/lib/dte-xml-parser";

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
    if (!hasFacturacionCapability(perms, "facturacion_issue")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para adjuntar XML" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const dte = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId, direction: "ISSUED" },
      select: {
        id: true,
        dteType: true,
        folio: true,
        issuerRut: true,
        receiverRut: true,
        totalAmount: true,
        dteXml: true,
        code: true,
      },
    });
    if (!dte) {
      return NextResponse.json(
        { success: false, error: "DTE no encontrado" },
        { status: 404 },
      );
    }
    if (dte.dteXml && dte.dteXml.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `El DTE ${dte.code} ya tiene XML local. No se puede sobrescribir desde acá; eliminalo manualmente con el equipo de soporte si es necesario.`,
        },
        { status: 409 },
      );
    }

    // Aceptamos tanto multipart/form-data (file upload) como JSON con
    // { xml: "<contenido>" }. El primero es el caso típico desde el
    // navegador; el segundo facilita testing por curl y casos donde el
    // usuario tiene el XML como string (ej: copiado del portal SII).
    const contentType = request.headers.get("content-type") ?? "";
    let xmlText = "";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { xml?: string };
      xmlText = (body.xml ?? "").trim();
    } else if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      const form = await request.formData();
      const file = form.get("file");
      if (file instanceof File) {
        xmlText = (await file.text()).trim();
      } else {
        const xmlField = form.get("xml");
        if (typeof xmlField === "string") xmlText = xmlField.trim();
      }
    } else {
      // Asume body crudo XML.
      xmlText = (await request.text()).trim();
    }

    if (!xmlText) {
      return NextResponse.json(
        { success: false, error: "No se recibió contenido XML" },
        { status: 400 },
      );
    }

    // Defensivo: limit razonable. Un DTE típico < 50 KB; con margen para
    // facturas con muchos detalles, 2 MB es de sobra.
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
    // Tolerancia de $1 en el total por redondeos legacy entre cliente/server.
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
          error: `El XML no coincide con este DTE. Diferencias: ${mismatches.join(", ")}. Verificá que estés subiendo el XML correcto.`,
        },
        { status: 400 },
      );
    }

    // Persistir el XML como Bytes. Buffer es Uint8Array en runtime; el
    // cast es solo para satisfacer Prisma (Bytes? = Uint8Array | null).
    await prisma.financeDte.update({
      where: { id: dte.id },
      data: { dteXml: new Uint8Array(Buffer.from(xmlText, "utf-8")) },
    });

    // Audit log: documenta quién subió el XML y para qué DTE. Útil si
    // después hay disputa con el receptor sobre la autenticidad.
    try {
      const { logAudit } = await import("@/lib/audit");
      await logAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "DTE_XML_ATTACHED",
        entity: "FinanceDte",
        entityId: dte.id,
        details: {
          dteType: dte.dteType,
          folio: dte.folio,
          xmlBytes: xmlText.length,
        },
      });
    } catch {
      // best-effort; no romper el flow si el audit falla
    }

    return NextResponse.json({
      success: true,
      data: {
        message: `XML adjuntado correctamente al DTE ${dte.code}. Ya podés cederlo a factoring.`,
        bytes: xmlText.length,
      },
    });
  } catch (error) {
    console.error("[Finance/Billing] Error attaching XML:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
