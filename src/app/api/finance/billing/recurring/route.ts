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
import { syncRecurringDteItem } from "@/modules/finance/cashflow/generators/recurring-dte-sync";
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

    const templateIds = templates.map((t) => t.id);

    const [accounts, installations, lastRuns] = await Promise.all([
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
      templateIds.length > 0
        ? prisma.$queryRaw<Array<{ template_id: string; dte_id: string | null; auto_send_issues: unknown; ran_at: Date }>>`
            SELECT DISTINCT ON (template_id)
              template_id, dte_id, auto_send_issues, ran_at
            FROM finance.finance_dte_recurring_runs
            WHERE template_id = ANY(${templateIds}::uuid[])
              AND tenant_id = ${ctx.tenantId}
            ORDER BY template_id, ran_at DESC
          `
        : Promise.resolve([]),
    ]);

    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const installationById = new Map(installations.map((i) => [i.id, i]));
    const lastRunByTemplateId = new Map(
      lastRuns.map((r) => [r.template_id, r]),
    );

    const enriched = templates.map((t) => {
      const lr = lastRunByTemplateId.get(t.id);
      return {
        ...t,
        crmAccount: t.crmAccountId
          ? (accountById.get(t.crmAccountId) ?? null)
          : null,
        installation: t.installationId
          ? (installationById.get(t.installationId) ?? null)
          : null,
        // Si el draft del run ya no existe (dte_id null por SetNull al
        // borrar el draft manualmente), ignoramos los issues — el usuario
        // tomó acción explícita, no queremos seguir mostrando el banner.
        lastRunIssues: lr?.dte_id != null ? (lr.auto_send_issues ?? null) : null,
        lastRunDteId: lr?.dte_id ?? null,
      };
    });

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

    if (body.recipientContactIds && body.recipientContactIds.length > 0) {
      if (!body.crmAccountId) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Para seleccionar contactos destinatarios, la plantilla debe estar vinculada a un cliente CRM.",
          },
          { status: 400 },
        );
      }
      const validContacts = await prisma.crmContact.count({
        where: {
          tenantId: ctx.tenantId,
          accountId: body.crmAccountId,
          id: { in: body.recipientContactIds },
        },
      });
      if (validContacts !== body.recipientContactIds.length) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Uno o más contactos seleccionados no pertenecen al cliente CRM o no existen.",
          },
          { status: 400 },
        );
      }
    }

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
        recipientContactIds: body.recipientContactIds ?? [],
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
        hasIpcAdjustment: body.hasIpcAdjustment ?? false,
        ipcAdjustmentMonths: body.hasIpcAdjustment
          ? (body.ipcAdjustmentMonths ?? null)
          : null,
        ipcStartDate:
          body.hasIpcAdjustment && body.ipcStartDate
            ? new Date(body.ipcStartDate)
            : null,
        createdBy: ctx.userId,
      },
    });
    await syncRecurringDteItem(ctx.tenantId, created.id);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Recurring] Create error:", error);
    const message = error instanceof Error ? error.message : "Error al crear plantilla";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
