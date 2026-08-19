import "server-only";
import { prisma } from "@/lib/prisma";
import {
  resolveIssueYmdForPeriod,
  type BillingPeriodTemplate,
} from "@/modules/finance/billing/dte-recurring-schedule";
import { upsertDteDateOverride } from "@/modules/finance/cashflow/dte-date-override.service";
import { isMondayYmd, ymdToDate } from "./weeks";
import { assertV3WeeksWritable } from "./weekly-close.adapter";

export function scheduledOverrideKey(templateId: string, billingPeriod: string): string {
  return `${templateId}::${billingPeriod}`;
}

export async function loadScheduledDateOverrides(
  tenantId: string,
  templateIds: string[],
): Promise<Map<string, string>> {
  if (templateIds.length === 0) return new Map();
  const rows = await prisma.financeCashflowScheduledDateOverride.findMany({
    where: { tenantId, templateId: { in: templateIds } },
    select: { templateId: true, billingPeriod: true, customDate: true },
  });
  return new Map(
    rows.map((r) => [
      scheduledOverrideKey(r.templateId, r.billingPeriod),
      r.customDate.toISOString().slice(0, 10),
    ]),
  );
}

function assertMonday(weekStart: string): Date {
  if (!isMondayYmd(weekStart)) {
    throw new Error(`toWeek inválido: debe ser lunes ISO (YYYY-MM-DD): ${weekStart}`);
  }
  const d = ymdToDate(weekStart);
  if (!d) throw new Error(`toWeek inválido: ${weekStart}`);
  return d;
}

/**
 * Mueve una cuota programada (P) a otra semana del flujo.
 * Solo visibilidad: no toca el template, no genera borrador, no mueve facturas.
 */
export async function moveScheduledQuota(args: {
  tenantId: string;
  templateId: string;
  billingPeriod: string;
  toWeek: string;
  createdBy: string;
  reason?: string | null;
}): Promise<{ templateId: string; billingPeriod: string; customDate: string }> {
  const { tenantId, templateId, billingPeriod, createdBy } = args;
  const customDate = assertMonday(args.toWeek);
  await assertV3WeeksWritable(tenantId, [args.toWeek]);

  const template = await prisma.financeDteRecurringTemplate.findFirst({
    where: { id: templateId, tenantId },
    select: {
      id: true,
      frequency: true,
      dayOfMonth: true,
      dayOfWeek: true,
      monthOfYear: true,
      startDate: true,
      endDate: true,
      lastRunAt: true,
      facturaTiming: true,
      facturaDay: true,
      facturaMesRelativo: true,
    },
  });
  if (!template) throw new Error("Programación no encontrada");

  const issueYmd = resolveIssueYmdForPeriod(template as BillingPeriodTemplate, billingPeriod);
  if (!issueYmd) throw new Error("Cuota no encontrada en la programación");
  const originalDate = ymdToDate(issueYmd);
  if (!originalDate) throw new Error("Cuota no encontrada en la programación");

  await prisma.financeCashflowScheduledDateOverride.upsert({
    where: {
      tenantId_templateId_billingPeriod: { tenantId, templateId, billingPeriod },
    },
    create: {
      tenantId,
      templateId,
      billingPeriod,
      originalDate,
      customDate,
      createdBy,
      reason: args.reason ?? null,
    },
    update: {
      customDate,
      reason: args.reason ?? null,
    },
  });

  return {
    templateId,
    billingPeriod,
    customDate: args.toWeek,
  };
}

/**
 * Si la cuota ya estaba movida en el flujo, el borrador/factura nace en
 * esa misma semana (override de DTE). No pisa un override ya existente.
 */
export async function inheritScheduledOverrideToDte(args: {
  tenantId: string;
  templateId: string;
  billingPeriod: string;
  dteId: string;
  createdBy: string;
}): Promise<boolean> {
  const { tenantId, templateId, billingPeriod, dteId, createdBy } = args;
  const scheduled = await prisma.financeCashflowScheduledDateOverride.findUnique({
    where: { tenantId_templateId_billingPeriod: { tenantId, templateId, billingPeriod } },
    select: { customDate: true },
  });
  if (!scheduled) return false;
  const existing = await prisma.financeCashflowDteDateOverride.findUnique({
    where: { tenantId_dteId: { tenantId, dteId } },
    select: { dteId: true },
  });
  if (existing) return false;
  await upsertDteDateOverride({
    tenantId,
    dteId,
    customDate: scheduled.customDate,
    createdBy,
    reason: "Heredado de programación movida en el flujo",
  });
  return true;
}
