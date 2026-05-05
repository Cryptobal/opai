import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { dteCreditNoteSchema } from "@/lib/validations/finance";
import { issueDte } from "@/modules/finance/billing/dte-issuer.service";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
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
