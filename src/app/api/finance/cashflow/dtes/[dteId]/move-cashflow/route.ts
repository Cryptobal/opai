import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  upsertDteDateOverride,
  clearDteDateOverride,
} from "@/modules/finance/cashflow/dte-date-override.service";
import { prisma } from "@/lib/prisma";

const moveSchema = z.object({
  newDate: z.coerce.date().optional(),
  daysFromCurrent: z.number().int().optional(),
  restore: z.boolean().optional(),
  reason: z.string().max(200).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dteId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { dteId } = await context.params;
    const parsed = await parseBody(request, moveSchema);
    if (parsed.error) return parsed.error;
    const { newDate, daysFromCurrent, restore, reason } = parsed.data;

    if (restore) {
      await clearDteDateOverride(ctx.tenantId, dteId);
      return NextResponse.json({ success: true });
    }

    // Admitir emitidos y borradores (v4.7: mover todo borrador).
    const dte = await prisma.financeDte.findFirst({
      where: {
        id: dteId,
        tenantId: ctx.tenantId,
        direction: "ISSUED",
        siiStatus: { notIn: ["ANNULLED", "REJECTED"] },
      },
      select: { id: true, date: true, siiStatus: true },
    });
    if (!dte) {
      return NextResponse.json({ success: false, error: "DTE no encontrado" }, { status: 404 });
    }

    let target: Date;
    if (newDate) {
      target = newDate;
    } else if (daysFromCurrent !== undefined) {
      const existing = await prisma.financeCashflowDteDateOverride.findUnique({
        where: { tenantId_dteId: { tenantId: ctx.tenantId, dteId } },
        select: { customDate: true },
      });
      const base = existing?.customDate ?? dte.date;
      target = new Date(base);
      target.setDate(target.getDate() + daysFromCurrent);
    } else {
      return NextResponse.json(
        { success: false, error: "Falta newDate, daysFromCurrent o restore" },
        { status: 400 },
      );
    }

    await upsertDteDateOverride({
      tenantId: ctx.tenantId,
      dteId,
      customDate: target,
      createdBy: ctx.userId,
      reason: reason ?? (dte.siiStatus === "DRAFT" ? "move-draft" : reason),
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST dtes/move-cashflow:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
