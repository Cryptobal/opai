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

    if (!body.lines || body.lines.length === 0) {
      return NextResponse.json(
        { success: false, error: "Debe incluir al menos una linea en la nota de débito" },
        { status: 400 }
      );
    }

    // Para Nota de Débito, referenceType usual es 3 (corrige montos)
    // o 2 (corrige texto). Default 3 si no viene en payload.
    const code = (body.referenceType ?? 3) as 1 | 2 | 3;

    const result = await issueDte(ctx.tenantId, ctx.userId, {
      dteType: 56,
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

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Billing] Error issuing debit note:", error);
    const message =
      error instanceof Error ? error.message : "Error al emitir nota de débito";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
