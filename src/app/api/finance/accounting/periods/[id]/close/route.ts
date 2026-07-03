import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { closePeriod } from "@/modules/finance/accounting/period.service";
import { countDocumentsWithoutEntry } from "@/modules/finance/accounting/accounting-health.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { force?: unknown };
    const force = body.force === true;

    // Guarda de cierre coherente: un período no se cierra dejando documentos
    // emitidos sin asiento — salvo override explícito y auditado.
    const period = await prisma.financeAccountingPeriod.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, year: true, month: true, status: true },
    });
    if (!period) {
      return NextResponse.json(
        { success: false, error: "Período no encontrado" },
        { status: 404 }
      );
    }

    const orphanCount =
      period.status === "OPEN"
        ? await countDocumentsWithoutEntry(ctx.tenantId, {
            year: period.year,
            month: period.month,
          })
        : 0;

    if (orphanCount > 0 && !force) {
      return NextResponse.json(
        {
          success: false,
          code: "DOCS_WITHOUT_ENTRY",
          count: orphanCount,
          error: `Hay ${orphanCount} documento(s) emitido(s) sin asiento en este período. Genera los asientos faltantes antes de cerrar (o cierra de todos modos explícitamente).`,
        },
        { status: 409 }
      );
    }

    const closed = await closePeriod(ctx.tenantId, id, ctx.userId);

    // Override auditado: se cerró con documentos sin asiento a sabiendas.
    if (orphanCount > 0 && force) {
      await logAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        userEmail: ctx.userEmail ?? null,
        action: "UPDATE",
        entity: "finance_accounting_period",
        entityId: id,
        details: {
          event: "accounting_period_closed_with_orphans",
          year: period.year,
          month: period.month,
          orphanCount,
          force: true,
        },
        request,
      });
    }

    return NextResponse.json({ success: true, data: closed });
  } catch (error) {
    console.error("[Finance Period Close] Error:", error);
    const message =
      error instanceof Error ? error.message : "Error al cerrar período";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
