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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const tpl = await prisma.financeDteRecurringTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!tpl) return NextResponse.json({ success: false, error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ success: true, data: tpl });
  } catch (error) {
    console.error("[Finance/Recurring] Get error:", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
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
      return NextResponse.json({ success: false, error: "Sin permiso" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.financeDteRecurringTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "No encontrada" }, { status: 404 });
    }

    const parsed = await parseBody(request, recurringTemplateSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const startDate = new Date(body.startDate);
    const endDate = body.endDate ? new Date(body.endDate) : null;
    // Recompute nextRunAt si cambió la frecuencia o la config de fecha.
    const freqChanged =
      existing.frequency !== body.frequency ||
      existing.dayOfMonth !== (body.dayOfMonth ?? null) ||
      existing.dayOfWeek !== (body.dayOfWeek ?? null) ||
      existing.monthOfYear !== (body.monthOfYear ?? null) ||
      existing.startDate.getTime() !== startDate.getTime();
    const nextRunAt = freqChanged
      ? computeNextRunAt({
          frequency: body.frequency,
          dayOfMonth: body.dayOfMonth ?? null,
          dayOfWeek: body.dayOfWeek ?? null,
          monthOfYear: body.monthOfYear ?? null,
          startDate,
          endDate,
          lastRunAt: existing.lastRunAt,
        })
      : existing.nextRunAt;

    const updated = await prisma.financeDteRecurringTemplate.update({
      where: { id },
      data: {
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
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Finance/Recurring] Update error:", error);
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_issue")) {
      return NextResponse.json({ success: false, error: "Sin permiso" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.financeDteRecurringTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "No encontrada" }, { status: 404 });
    }
    await prisma.financeDteRecurringTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Finance/Recurring] Delete error:", error);
    return NextResponse.json({ success: false, error: "Error al eliminar" }, { status: 500 });
  }
}
