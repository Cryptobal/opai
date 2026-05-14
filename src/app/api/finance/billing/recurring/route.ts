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

    // Enriquecemos cada plantilla con el nombre del cliente CRM y de la
    // instalación asociada (si existen). Lo hacemos con dos queries
    // batch para evitar N+1 y porque FinanceDteRecurringTemplate no
    // tiene relations directas en el schema (solo IDs sueltos).
    const accountIds = Array.from(
      new Set(
        templates
          .map((t) => t.crmAccountId)
          .filter((v): v is string => !!v),
      ),
    );
    const installationIds = Array.from(
      new Set(
        templates
          .map((t) => t.installationId)
          .filter((v): v is string => !!v),
      ),
    );

    const [accounts, installations] = await Promise.all([
      accountIds.length > 0
        ? prisma.crmAccount.findMany({
            where: { id: { in: accountIds }, tenantId: ctx.tenantId },
            select: { id: true, name: true, legalName: true, rut: true },
          })
        : Promise.resolve([]),
      installationIds.length > 0
        ? prisma.crmInstallation.findMany({
            where: { id: { in: installationIds }, tenantId: ctx.tenantId },
            select: { id: true, name: true, commune: true },
          })
        : Promise.resolve([]),
    ]);

    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const installationById = new Map(installations.map((i) => [i.id, i]));

    const enriched = templates.map((t) => ({
      ...t,
      crmAccount: t.crmAccountId
        ? accountById.get(t.crmAccountId) ?? null
        : null,
      installation: t.installationId
        ? installationById.get(t.installationId) ?? null
        : null,
    }));

    return NextResponse.json({ success: true, data: { templates: enriched } });
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
        contractDocumentId: body.contractDocumentId ?? null,
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
        autoSendProforma: body.autoSendProforma,
        autoSendPaymentStatement: body.autoSendPaymentStatement,
        ufFixingPolicy: body.ufFixingPolicy,
        ufFixingDay:
          body.ufFixingPolicy === "CUSTOM_DAY"
            ? (body.ufFixingDay ?? null)
            : null,
        periodPolicy: body.periodPolicy,
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
