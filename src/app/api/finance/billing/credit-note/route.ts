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

    const result = await issueDte(ctx.tenantId, ctx.userId, {
      dteType: 61,
      ...body,
      receiverRut: originalDte.receiverRut,
      receiverName: originalDte.receiverName,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Billing] Error issuing credit note:", error);
    return NextResponse.json(
      { success: false, error: "Error al emitir nota de crédito" },
      { status: 500 }
    );
  }
}
