/**
 * Herencia de vínculo programación↔DTE al emitir/crear borrador directo.
 * Puro respecto de prisma salvo la query de templates activos de la cuenta.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveBillingPeriodForDate } from "./dte-recurring-schedule";

export interface InheritedTemplateLink {
  recurringTemplateId: string;
  billingPeriod: string;
}

/**
 * Si la cuenta tiene exactamente una programación activa 33/34, propone
 * ese vínculo + período para la fecha de emisión. Con 0 o >1 → null
 * (el form ofrece selector sin default).
 */
export async function resolveDefaultTemplateLink(
  tenantId: string,
  crmAccountId: string,
  dteDateYmd: string,
): Promise<InheritedTemplateLink | null> {
  const templates = await prisma.financeDteRecurringTemplate.findMany({
    where: {
      tenantId,
      crmAccountId,
      isActive: true,
      dteType: { in: [33, 34] },
    },
    select: {
      id: true,
      frequency: true, dayOfMonth: true, dayOfWeek: true, monthOfYear: true,
      startDate: true, endDate: true, lastRunAt: true,
      facturaTiming: true, facturaDay: true, facturaMesRelativo: true,
    },
    take: 2,
  });
  if (templates.length !== 1) return null;
  const t = templates[0];
  return {
    recurringTemplateId: t.id,
    billingPeriod: resolveBillingPeriodForDate(t, dteDateYmd),
  };
}

/**
 * Aplica herencia solo cuando el caller NO declaró el vínculo
 * (`recurringTemplateId === undefined`). `null` explícito = factura extra.
 */
export async function applyTemplateLinkInheritance(
  tenantId: string,
  opts: {
    dteType: number;
    crmAccountId?: string | null;
    issueDateYmd: string;
    recurringTemplateId?: string | null;
    billingPeriod?: string | null;
  },
): Promise<{ recurringTemplateId: string | null; billingPeriod: string | null }> {
  let tplId = opts.recurringTemplateId;
  let period = opts.billingPeriod;

  if (
    tplId === undefined &&
    opts.crmAccountId &&
    (opts.dteType === 33 || opts.dteType === 34)
  ) {
    const inherited = await resolveDefaultTemplateLink(
      tenantId,
      opts.crmAccountId,
      opts.issueDateYmd,
    );
    if (inherited) {
      tplId = inherited.recurringTemplateId;
      if (period === undefined || period === null || period === "") {
        period = inherited.billingPeriod;
      }
    }
  }

  return {
    recurringTemplateId: tplId ?? null,
    billingPeriod: period ?? null,
  };
}
