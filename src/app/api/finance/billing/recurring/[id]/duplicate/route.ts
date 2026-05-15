import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { computeNextRunAt } from "@/modules/finance/billing/dte-recurring.service";

/**
 * POST /api/finance/billing/recurring/[id]/duplicate
 *
 * Crea una nueva plantilla con la misma configuración que la original.
 * Queda en pausa (`isActive: false`) y sin historial de corridas para evitar
 * doble facturación hasta que el usuario revise y active.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (
      !hasFacturacionCapability(perms, "facturacion_issue") &&
      !hasFacturacionCapability(perms, "facturacion_create_draft")
    ) {
      return NextResponse.json(
        { success: false, error: "Sin permiso" },
        { status: 403 },
      );
    }
    const { id } = await params;

    const orig = await prisma.financeDteRecurringTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!orig) {
      return NextResponse.json(
        { success: false, error: "Plantilla no encontrada" },
        { status: 404 },
      );
    }

    const baseName = orig.name.replace(/\s*\(copia\)\s*$/i, "").trim();
    const name = `${baseName} (copia)`;

    const nextRunAt = computeNextRunAt({
      frequency: orig.frequency,
      dayOfMonth: orig.dayOfMonth,
      dayOfWeek: orig.dayOfWeek,
      monthOfYear: orig.monthOfYear,
      startDate: orig.startDate,
      endDate: orig.endDate,
      lastRunAt: null,
    });

    const created = await prisma.financeDteRecurringTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        name,
        isActive: false,
        dteType: orig.dteType,
        receiverRut: orig.receiverRut,
        receiverName: orig.receiverName,
        receiverEmail: orig.receiverEmail,
        receiverEmailCc: orig.receiverEmailCc,
        receiverGiro: orig.receiverGiro,
        receiverDireccion: orig.receiverDireccion,
        receiverComuna: orig.receiverComuna,
        receiverCiudad: orig.receiverCiudad,
        crmAccountId: orig.crmAccountId,
        installationId: orig.installationId,
        contractDocumentId: orig.contractDocumentId,
        currency: orig.currency,
        lines: orig.lines as Prisma.InputJsonValue,
        notes: orig.notes,
        additionalReferences:
          orig.additionalReferences === null
            ? undefined
            : (orig.additionalReferences as Prisma.InputJsonValue),
        frequency: orig.frequency,
        dayOfMonth: orig.dayOfMonth,
        dayOfWeek: orig.dayOfWeek,
        monthOfYear: orig.monthOfYear,
        startDate: orig.startDate,
        endDate: orig.endDate,
        nextRunAt,
        lastRunAt: null,
        runCount: 0,
        autoSendEmail: orig.autoSendEmail,
        autoSendProforma: orig.autoSendProforma,
        autoSendPaymentStatement: orig.autoSendPaymentStatement,
        ufFixingPolicy: orig.ufFixingPolicy,
        ufFixingDay: orig.ufFixingDay,
        periodPolicy: orig.periodPolicy,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Recurring] Duplicate error:", error);
    const message =
      error instanceof Error ? error.message : "Error al duplicar plantilla";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
