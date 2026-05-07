import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { recurringTemplateSchema } from "@/lib/validations/finance";
import { computeNextRunAt } from "@/modules/finance/billing/dte-recurring.service";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const templates = await prisma.financeDteRecurringTemplate.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ isActive: "desc" }, { nextRunAt: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ success: true, data: { templates } });
  } catch (error) {
    console.error("[Finance/Recurring] List error:", error);
    return NextResponse.json({ success: false, error: "Error al listar plantillas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    // Crear plantilla recurrente requiere permiso de issue (es trabajo
    // delegado del workflow normal de emisión).
    if (
      !hasFacturacionCapability(perms, "facturacion_issue") &&
      !hasFacturacionCapability(perms, "facturacion_create_draft")
    ) {
      return NextResponse.json({ success: false, error: "Sin permiso" }, { status: 403 });
    }
    const parsed = await parseBody(request, recurringTemplateSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const startDate = new Date(body.startDate);
    const endDate = body.endDate ? new Date(body.endDate) : null;
    const nextRunAt = computeNextRunAt({
      frequency: body.frequency,
      dayOfMonth: body.dayOfMonth ?? null,
      dayOfWeek: body.dayOfWeek ?? null,
      monthOfYear: body.monthOfYear ?? null,
      startDate,
      endDate,
      lastRunAt: null,
    });

    const created = await prisma.financeDteRecurringTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        isActive: body.isActive,
        dteType: body.dteType,
        receiverRut: body.receiverRut,
        receiverName: body.receiverName,
        receiverEmail: body.receiverEmail ?? null,
        receiverEmailCc: body.receiverEmailCc,
        receiverGiro: body.receiverGiro ?? null,
        receiverDireccion: body.receiverDireccion ?? null,
        receiverComuna: body.receiverComuna ?? null,
        receiverCiudad: body.receiverCiudad ?? null,
        crmAccountId: body.crmAccountId ?? null,
        installationId: body.installationId ?? null,
        currency: body.currency,
        lines: body.lines as object,
        notes: body.notes ?? null,
        additionalReferences: body.additionalReferences ? (body.additionalReferences as object) : undefined,
        frequency: body.frequency,
        dayOfMonth: body.dayOfMonth ?? null,
        dayOfWeek: body.dayOfWeek ?? null,
        monthOfYear: body.monthOfYear ?? null,
        startDate,
        endDate,
        nextRunAt,
        autoSendEmail: body.autoSendEmail,
        ufFixingPolicy: body.ufFixingPolicy,
        ufFixingDay:
          body.ufFixingPolicy === "CUSTOM_DAY"
            ? (body.ufFixingDay ?? null)
            : null,
        createdBy: ctx.userId,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Recurring] Create error:", error);
    const message = error instanceof Error ? error.message : "Error al crear plantilla";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
