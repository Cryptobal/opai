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
import { formatDateOnlyUtcYmd } from "@/lib/fx-date";

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

    // Guard 0: la factura referenciada debe existir ANTE EL SII. Si el SII la
    // rechazó (REJECTED), tributariamente NO existe → una NC que la referencia
    // será rechazada con (REF-3-750) "DTE Referenciado no recibido en el SII",
    // pero el correo al cliente ya salió en la emisión (auto-send). Una factura
    // rechazada no se anula: se RE-EMITE con folio nuevo. Bloqueamos acá con
    // mensaje claro para no generar NCs muertas ni mandar docs inválidos.
    if (originalDte.siiStatus === "REJECTED") {
      return NextResponse.json(
        {
          success: false,
          error: `La factura de referencia (folio ${originalDte.folio}) fue RECHAZADA por el SII, así que no existe ante el SII y no se puede anular con una Nota de Crédito (el SII rechazaría la NC con REF-3-750). No requiere NC: re-emití la factura con un folio nuevo.`,
        },
        { status: 409 },
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
      receiverEmail:
        body.receiverEmailOverride ?? originalDte.receiverEmail ?? undefined,
      receiverEmailCc: body.receiverEmailCc,
      receiverEmailBcc: body.receiverEmailBcc,
      autoSendEmail: body.autoSendEmail,
      accountId: originalDte.accountId ?? undefined,
      lines: body.lines,
      notes: body.reason,
      reference: {
        docId: originalDte.id,
        type: originalDte.dteType,
        folio: originalDte.folio,
        date: formatDateOnlyUtcYmd(originalDte.date),
        code,
        reason: body.reason,
      },
    });

    // Reflejar el estado de acreditación en el DTE original.
    //   code=1 → setear voidedByCreditNoteId + voidedAt (sale del flujo y cobranza).
    //   code=2 → no toca montos (corrige solo texto).
    //   code=3 → incrementar creditedNetAmount con el neto de esta NC.
    // No se reintenta si falla — la NC ya impactó al SII, no podemos
    // revertir. Loggeamos explícito para que el operador pueda fixear
    // a mano (raro: UPDATE local sobre row existente).
    try {
      if (code === 1) {
        await prisma.financeDte.update({
          where: { id: originalDte.id },
          data: {
            voidedByCreditNoteId: result.id,
            voidedAt: new Date(),
            // Cancelada por NC: limpiar saldo pendiente para que NO siga
            // apareciendo en filtros de Pendiente/Vencido.
            paymentStatus: "PAID",
            amountPaid: originalDte.totalAmount,
            amountPending: 0,
          },
        });
      } else if (code === 3) {
        const ncTotalNet = Math.round(
          body.lines.reduce(
            (acc: number, l: { quantity?: number; unitPrice?: number }) =>
              acc + (l.quantity ?? 0) * (l.unitPrice ?? 0),
            0,
          ),
        );
        // Prorratear IVA usando ratio total/net del original.
        const origNet = Number(originalDte.netAmount ?? 0);
        const origTotal = Number(originalDte.totalAmount ?? 0);
        const ratio = origNet > 0 ? origTotal / origNet : 1;
        const ncTotalGross = Math.round(ncTotalNet * ratio);
        // Lee fresh para no pisar conciliaciones intermedias.
        const fresh = await prisma.financeDte.findUnique({
          where: { id: originalDte.id },
          select: {
            totalAmount: true,
            creditedNetAmount: true,
            amountPaid: true,
            paymentStatus: true,
          },
        });
        if (!fresh) throw new Error("DTE original desapareció");
        const newCreditedNet = Number(fresh.creditedNetAmount ?? 0) + ncTotalNet;
        const newAmountPending = Math.max(
          0,
          Number(fresh.totalAmount) - Number(fresh.amountPaid ?? 0) - ncTotalGross,
        );
        const newStatus: "PAID" | "PARTIAL" | "UNPAID" | "OVERDUE" = (() => {
          const paid = Number(fresh.amountPaid ?? 0);
          // Solo es PAID si hay pago real que cubre el saldo post-NC.
          if (newAmountPending === 0 && paid > 0) return "PAID";
          if (paid > 0) return "PARTIAL";
          // Sin pagos reales: la NC parcial reduce el monto cobrable pero
          // NO marca la factura como pagada. Mantenemos el estado original.
          return (fresh.paymentStatus as
            | "UNPAID"
            | "OVERDUE"
            | "PARTIAL"
            | "PAID") ?? "UNPAID";
        })();
        await prisma.financeDte.update({
          where: { id: originalDte.id },
          data: {
            creditedNetAmount: newCreditedNet,
            amountPending: newAmountPending,
            paymentStatus: newStatus,
          },
        });
      }
    } catch (updateErr) {
      console.error(
        "[Finance/Billing] NC emitida OK pero falló UPDATE del DTE original. Requiere fix manual:",
        { originalDteId: originalDte.id, ncId: result.id, code, error: updateErr },
      );
    }

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
