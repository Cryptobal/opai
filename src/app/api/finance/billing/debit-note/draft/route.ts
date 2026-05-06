import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { dteCreditNoteSchema } from "@/lib/validations/finance";
import { createDraftDte } from "@/modules/finance/billing/dte-draft.service";
import { prisma } from "@/lib/prisma";

const draftDebitNoteSchema = dteCreditNoteSchema.extend({
  lines: z.array(z.any()).min(1, "Debe incluir al menos una línea"),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (
      !hasFacturacionCapability(perms, "facturacion_create_draft") &&
      !hasFacturacionCapability(perms, "facturacion_credit_note")
    ) {
      return NextResponse.json(
        { success: false, error: "Sin permiso para crear borradores de ND" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, draftDebitNoteSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const originalDte = await prisma.financeDte.findFirst({
      where: { id: body.referenceDteId, tenantId: ctx.tenantId, siiStatus: { not: "DRAFT" } },
    });
    if (!originalDte) {
      return NextResponse.json(
        { success: false, error: "DTE de referencia no encontrado o es DRAFT" },
        { status: 404 },
      );
    }

    const code = (body.referenceType ?? 3) as 1 | 2 | 3;
    const draft = await createDraftDte(ctx.tenantId, ctx.userId, {
      dteType: 56,
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

    return NextResponse.json({ success: true, data: draft }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Billing] Error creating debit-note draft:", error);
    const message = error instanceof Error ? error.message : "Error al crear borrador ND";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
