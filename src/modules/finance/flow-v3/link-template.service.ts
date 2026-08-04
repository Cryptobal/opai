import "server-only";
import { prisma } from "@/lib/prisma";
import { cleanRut } from "@/lib/chile-rut";
import { resolveBillingPeriodForDate } from "@/modules/finance/billing/dte-recurring-schedule";

export interface LinkTemplateResult {
  dteId: string;
  recurringTemplateId: string;
  billingPeriod: string;
  crmAccountId: string;
  /** true si ya estaba vinculado al mismo template (no-op). */
  noop: boolean;
  /** true si el período ya tiene otra factura del mismo template. */
  periodHasOtherDte: boolean;
}

/**
 * Vincula un DTE emitido a una programación de la misma cuenta.
 * Setea recurringTemplateId + billingPeriod (calendario del template) y
 * crmAccountId si faltaba (resolución RUT). Idempotente si ya está al mismo tpl.
 */
export async function linkDteToTemplate(
  tenantId: string,
  dteId: string,
  templateId: string,
): Promise<LinkTemplateResult> {
  const [dte, template] = await Promise.all([
    prisma.financeDte.findFirst({
      where: { id: dteId, tenantId, direction: "ISSUED" },
      select: {
        id: true, crmAccountId: true, receiverRut: true, date: true,
        recurringTemplateId: true, billingPeriod: true, dteType: true,
      },
    }),
    prisma.financeDteRecurringTemplate.findFirst({
      where: { id: templateId, tenantId },
      select: {
        id: true, crmAccountId: true, receiverRut: true,
        frequency: true, dayOfMonth: true, dayOfWeek: true, monthOfYear: true,
        startDate: true, endDate: true, lastRunAt: true,
        facturaTiming: true, facturaDay: true, facturaMesRelativo: true,
      },
    }),
  ]);
  if (!dte) throw new Error("DTE no encontrado");
  if (![33, 34].includes(dte.dteType)) {
    throw new Error("Solo facturas 33/34 se vinculan a programación");
  }
  if (!template) throw new Error("Programación no encontrada");
  if (!template.crmAccountId) {
    throw new Error("La programación no tiene cuenta CRM");
  }

  // Resolver cuenta del DTE (id o RUT).
  let accountId = dte.crmAccountId;
  if (!accountId && dte.receiverRut) {
    const rutKey = cleanRut(dte.receiverRut);
    if (rutKey) {
      const accounts = await prisma.crmAccount.findMany({
        where: { tenantId, rut: { not: null } },
        select: { id: true, rut: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 5000,
      });
      const hit = accounts.find((a) => a.rut && cleanRut(a.rut) === rutKey);
      if (hit) accountId = hit.id;
    }
  }
  if (!accountId) throw new Error("El DTE no tiene cuenta CRM resoluble");
  if (accountId !== template.crmAccountId) {
    throw new Error("La programación no pertenece a la misma cuenta del DTE");
  }

  // Guard: no sobrescribir vínculo distinto ya presente.
  if (dte.recurringTemplateId && dte.recurringTemplateId !== templateId) {
    throw new Error("El DTE ya está vinculado a otra programación");
  }

  const dteDateYmd = dte.date.toISOString().slice(0, 10);
  const billingPeriod = resolveBillingPeriodForDate(template, dteDateYmd);

  if (dte.recurringTemplateId === templateId && dte.billingPeriod === billingPeriod) {
    const other = await countOtherDtesInPeriod(tenantId, templateId, billingPeriod, dte.id);
    return {
      dteId: dte.id,
      recurringTemplateId: templateId,
      billingPeriod,
      crmAccountId: accountId,
      noop: true,
      periodHasOtherDte: other > 0,
    };
  }

  const other = await countOtherDtesInPeriod(tenantId, templateId, billingPeriod, dte.id);

  await prisma.financeDte.update({
    where: { id: dte.id },
    data: {
      recurringTemplateId: templateId,
      billingPeriod,
      crmAccountId: accountId,
    },
  });

  return {
    dteId: dte.id,
    recurringTemplateId: templateId,
    billingPeriod,
    crmAccountId: accountId,
    noop: false,
    periodHasOtherDte: other > 0,
  };
}

async function countOtherDtesInPeriod(
  tenantId: string,
  templateId: string,
  billingPeriod: string,
  excludeDteId: string,
): Promise<number> {
  return prisma.financeDte.count({
    where: {
      tenantId,
      recurringTemplateId: templateId,
      billingPeriod,
      id: { not: excludeDteId },
      siiStatus: { notIn: ["ANNULLED", "REJECTED"] },
      voidedByCreditNoteId: null,
    },
  });
}

export interface AccountTemplateOption {
  id: string;
  name: string;
  installationId: string | null;
  isActive: boolean;
  /** Período que se asignaría al vincular este DTE. */
  suggestedBillingPeriod: string;
  /** Hay otra F° del mismo template+período. */
  periodHasOtherDte: boolean;
}

/** Programaciones de la cuenta del DTE (activas primero) con preview de período. */
export async function listTemplatesForDte(
  tenantId: string,
  dteId: string,
): Promise<{ accountId: string | null; templates: AccountTemplateOption[] }> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    select: {
      id: true, crmAccountId: true, receiverRut: true, date: true,
    },
  });
  if (!dte) throw new Error("DTE no encontrado");

  let accountId = dte.crmAccountId;
  if (!accountId && dte.receiverRut) {
    const rutKey = cleanRut(dte.receiverRut);
    if (rutKey) {
      const accounts = await prisma.crmAccount.findMany({
        where: { tenantId, rut: { not: null } },
        select: { id: true, rut: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 5000,
      });
      const hit = accounts.find((a) => a.rut && cleanRut(a.rut) === rutKey);
      if (hit) accountId = hit.id;
    }
  }
  if (!accountId) return { accountId: null, templates: [] };

  const templates = await prisma.financeDteRecurringTemplate.findMany({
    where: { tenantId, crmAccountId: accountId, dteType: { in: [33, 34] } },
    select: {
      id: true, name: true, installationId: true, isActive: true,
      frequency: true, dayOfMonth: true, dayOfWeek: true, monthOfYear: true,
      startDate: true, endDate: true, lastRunAt: true,
      facturaTiming: true, facturaDay: true, facturaMesRelativo: true,
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const dteDateYmd = dte.date.toISOString().slice(0, 10);
  const out: AccountTemplateOption[] = [];
  for (const t of templates) {
    const suggestedBillingPeriod = resolveBillingPeriodForDate(t, dteDateYmd);
    const periodHasOtherDte =
      (await countOtherDtesInPeriod(tenantId, t.id, suggestedBillingPeriod, dte.id)) > 0;
    out.push({
      id: t.id,
      name: t.name,
      installationId: t.installationId,
      isActive: t.isActive,
      suggestedBillingPeriod,
      periodHasOtherDte,
    });
  }
  return { accountId, templates: out };
}
