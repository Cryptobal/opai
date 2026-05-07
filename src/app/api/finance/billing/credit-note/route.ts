import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { dteCreditNoteSchema } from "@/lib/validations/finance";
import { issueDte } from "@/modules/finance/billing/dte-issuer.service";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_credit_note")) {
      return NextResponse.json(
        {
          success: false,
          error: "No tiene permiso para emitir notas de crédito/débito",
        },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, dteCreditNoteSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const originalDte = await prisma.financeDte.findFirst({
      where: { id: body.referenceDteId, tenantId: ctx.tenantId },
    });

    if (!originalDte) {
      return NextResponse.json(
        { success: false, error: "DTE de referencia no encontrado" },
        { status: 404 }
      );
    }

    if (!body.lines || body.lines.length === 0) {
      return NextResponse.json(
        { success: false, error: "Debe incluir al menos una linea en la nota de crédito" },
        { status: 400 }
      );
    }

    // referenceType del payload reusa los códigos SII CodRef (1/2/3).
    // Default 1 (anula) si el cliente no lo manda — coincide con el
    // default histórico del CreditNoteForm.
    const code = (body.referenceType ?? 1) as 1 | 2 | 3;

    // Una sola query trae todas las NCs vivas de la factura. Reusada por
    // los guards 1 (anulación previa) y 3 (saldo agotado por NCs parciales).
    const existingActiveNcs = await prisma.financeDte.findMany({
      where: {
        tenantId: ctx.tenantId,
        dteType: 61,
        referenceDteId: originalDte.id,
        siiStatus: { in: ["ACCEPTED", "PENDING", "SENT", "WITH_OBJECTIONS"] },
      },
      select: { id: true, folio: true, netAmount: true, referenceCode: true },
    });

    const existingFullAnnulment = existingActiveNcs.find(
      (n) => n.referenceCode === 1,
    );
    const creditedNetSoFar = existingActiveNcs.reduce(
      (acc, n) => acc + Number(n.netAmount ?? 0),
      0,
    );
    const originalNet = originalDte.netAmount.toNumber();

    // Guard 1: bloquear segunda anulación. Si ya hay una NC con CodRef=1
    // ACCEPTED/PENDING/SENT sobre este DTE, emitir otra es un error contable
    // que el SII puede aceptar pero deja la contabilidad inconsistente.
    // Aplica a TODOS los códigos: si la factura ya está anulada, no se le
    // puede aplicar ni siquiera una corrección de texto.
    if (existingFullAnnulment) {
      return NextResponse.json(
        {
          success: false,
          error: `Este DTE ya tiene una NC de anulación emitida (folio ${existingFullAnnulment.folio}). No se pueden emitir más notas sobre una factura anulada.`,
        },
        { status: 409 },
      );
    }

    // Guard 2: NC con CodRef=1 (anula) debe tener monto = original.
    // Si no, queda saldo pendiente que rompe el libro IVA.
    if (code === 1) {
      const ncTotal = body.lines.reduce(
        (acc: number, l: { quantity?: number; unitPrice?: number }) =>
          acc + (l.quantity ?? 0) * (l.unitPrice ?? 0),
        0,
      );
      const ncTotalNet = Math.round(ncTotal);
      // Tolerancia $1 para redondeos del frontend.
      if (Math.abs(ncTotalNet - originalNet) > 1) {
        return NextResponse.json(
          {
            success: false,
            error: `Para anular (CodRef=1), el monto neto de la NC debe coincidir con el original. NC: $${ncTotalNet.toLocaleString("es-CL")}, original: $${originalNet.toLocaleString("es-CL")}. Usá CodRef=3 si querés corregir solo una parte.`,
          },
          { status: 400 },
        );
      }
    }

    // Guard 3 (NUEVO): NC parcial (CodRef=3) no puede exceder el saldo
    // disponible. Si ya hay NCs anteriores que acreditaron $X del neto
    // original, esta NC no puede pasarse de $original - $X.
    if (code === 3) {
      const ncTotal = body.lines.reduce(
        (acc: number, l: { quantity?: number; unitPrice?: number }) =>
          acc + (l.quantity ?? 0) * (l.unitPrice ?? 0),
        0,
      );
      const ncTotalNet = Math.round(ncTotal);
      const remaining = Math.max(0, originalNet - creditedNetSoFar);

      if (creditedNetSoFar > 0 && remaining <= 1) {
        return NextResponse.json(
          {
            success: false,
            error: `Este DTE ya está totalmente acreditado (NCs previas suman $${creditedNetSoFar.toLocaleString("es-CL")} del neto original $${originalNet.toLocaleString("es-CL")}). No queda saldo para una nueva NC parcial.`,
          },
          { status: 409 },
        );
      }

      if (ncTotalNet - remaining > 1) {
        return NextResponse.json(
          {
            success: false,
            error: `El monto de la NC ($${ncTotalNet.toLocaleString("es-CL")}) excede el saldo disponible ($${remaining.toLocaleString("es-CL")}). Ya hay $${creditedNetSoFar.toLocaleString("es-CL")} acreditados sobre el neto original $${originalNet.toLocaleString("es-CL")}. Si querés anular el total, usá CodRef=1.`,
          },
          { status: 400 },
        );
      }
    }

    const result = await issueDte(ctx.tenantId, ctx.userId, {
      dteType: 61,
      receiverRut: originalDte.receiverRut,
      receiverName: originalDte.receiverName,
      receiverEmail: originalDte.receiverEmail ?? undefined,
      accountId: originalDte.accountId ?? undefined,
      lines: body.lines,
      notes: body.reason,
      reference: {
        docId: originalDte.id,
        type: originalDte.dteType,
        folio: originalDte.folio,
        date: originalDte.date.toISOString().split("T")[0],
        code,
        reason: body.reason,
      },
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Billing] Error issuing credit note:", error);
    const message =
      error instanceof Error ? error.message : "Error al emitir nota de crédito";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
