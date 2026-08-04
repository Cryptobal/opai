/**
 * Herencia de vínculo programación↔DTE al emitir/crear borrador directo.
 * Puro respecto de prisma salvo la query de templates activos de la cuenta.
 *
 * v4.3: con 2+ programaciones activas el vínculo es obligatorio en el camino
 * manual (undefined hereda; null = extra solo válido con 0–1 programaciones).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveBillingPeriodForDate } from "./dte-recurring-schedule";

export interface InheritedTemplateLink {
  recurringTemplateId: string;
  billingPeriod: string;
}

export class TemplateLinkRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateLinkRequiredError";
  }
}

/** Cuenta programaciones activas 33/34 de la cuenta (tope 3: basta para 0/1/2+). */
export async function countActiveAccountTemplates(
  tenantId: string,
  crmAccountId: string,
): Promise<number> {
  return prisma.financeDteRecurringTemplate.count({
    where: {
      tenantId,
      crmAccountId,
      isActive: true,
      dteType: { in: [33, 34] },
    },
  });
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
 * (`recurringTemplateId === undefined`). `null` explícito = factura extra
 * (válido solo con 0–1 programaciones activas).
 *
 * Con 2+ programaciones y sin vínculo resuelto → TemplateLinkRequiredError
 * (camino manual; los flujos automáticos siempre declaran el id).
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

  const isSalesInvoice = opts.dteType === 33 || opts.dteType === 34;

  if (
    tplId === undefined &&
    opts.crmAccountId &&
    isSalesInvoice
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

  const resolvedTpl = tplId ?? null;
  const resolvedPeriod = period ?? null;

  if (isSalesInvoice && opts.crmAccountId && !resolvedTpl) {
    const n = await countActiveAccountTemplates(tenantId, opts.crmAccountId);
    if (n >= 2) {
      throw new TemplateLinkRequiredError(
        "Este cliente tiene varias programaciones: elegí a cuál fila va la factura (cuota del período o factura extra en esa fila).",
      );
    }
  }

  return {
    recurringTemplateId: resolvedTpl,
    billingPeriod: resolvedPeriod,
  };
}
