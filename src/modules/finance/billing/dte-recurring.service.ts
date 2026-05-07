/**
 * Facturación Recurrente — Plantillas que generan BORRADORES.
 *
 * Diseño deliberado: el cron NO emite directo al SII. Cada corrida crea
 * un FinanceDte siiStatus=DRAFT que el usuario revisa y emite manualmente.
 * Esto evita errores caros (factura mal emitida = nota de crédito + folio
 * nuevo). Idempotencia: si lastRunAt = today, no duplica.
 */
import { prisma } from "@/lib/prisma";
import type { FinanceDteRecurringTemplate } from "@prisma/client";
import { createDraftDte, type DraftDteInput } from "./dte-draft.service";

export type Frequency = "monthly" | "biweekly" | "weekly" | "yearly";

/**
 * Política de fijación de UF cuando currency=UF.
 *   - RUN_DAY: UF del día en que se ejecuta el cron.
 *   - LAST_DAY_PREV_MONTH: UF del último día del mes anterior.
 *   - FIRST_DAY_MONTH: UF del primer día del mes en curso.
 *   - LAST_DAY_MONTH: UF del último día del mes en curso.
 *   - CUSTOM_DAY: UF del día N del mes (campo `ufFixingDay`).
 */
export type UfFixingPolicy =
  | "RUN_DAY"
  | "LAST_DAY_PREV_MONTH"
  | "FIRST_DAY_MONTH"
  | "LAST_DAY_MONTH"
  | "CUSTOM_DAY";

/**
 * Resuelve la fecha de UF a usar según la policy. Para todas las
 * policies excepto RUN_DAY, devuelve una fecha específica que el
 * caller pasa a `getUfValueForDate`. Para RUN_DAY devuelve null
 * (caller usa `getUfValue()` del día actual).
 */
export function resolveUfDateForPolicy(
  policy: UfFixingPolicy,
  ufFixingDay: number | null,
  now: Date = new Date(),
): Date | null {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  switch (policy) {
    case "RUN_DAY":
      return null;
    case "LAST_DAY_PREV_MONTH":
      // Día 0 del mes en curso = último día del mes anterior.
      return new Date(Date.UTC(y, m, 0));
    case "FIRST_DAY_MONTH":
      return new Date(Date.UTC(y, m, 1));
    case "LAST_DAY_MONTH":
      // Día 0 del mes siguiente = último día del mes en curso.
      return new Date(Date.UTC(y, m + 1, 0));
    case "CUSTOM_DAY": {
      const d = ufFixingDay ?? 1;
      // Clampear al último día disponible si el mes es más corto
      // (ej: 31 en febrero → 28/29).
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return new Date(Date.UTC(y, m, Math.min(d, lastDay)));
    }
    default:
      return null;
  }
}

type ComputeInput = Pick<
  FinanceDteRecurringTemplate,
  "frequency" | "dayOfMonth" | "dayOfWeek" | "monthOfYear" | "startDate" | "endDate" | "lastRunAt"
>;

function lastDayOfMonth(year: number, monthZeroIdx: number): number {
  return new Date(year, monthZeroIdx + 1, 0).getDate();
}

/**
 * Calcula el próximo nextRunAt según frequency. Si endDate está y
 * el resultado supera endDate → null (template completado).
 */
export function computeNextRunAt(template: ComputeInput, fromDate?: Date): Date | null {
  const base = fromDate ?? template.lastRunAt ?? template.startDate;
  const ref = new Date(base);
  ref.setHours(0, 0, 0, 0);
  // Si nunca ha corrido, partimos de startDate (incluido).
  const isFirst = !template.lastRunAt;
  let next: Date;

  switch (template.frequency as Frequency) {
    case "monthly": {
      next = new Date(ref);
      if (!isFirst) next.setMonth(next.getMonth() + 1);
      const dom = template.dayOfMonth ?? 1;
      const lastDay = lastDayOfMonth(next.getFullYear(), next.getMonth());
      next.setDate(dom === -1 ? lastDay : Math.min(dom, lastDay));
      break;
    }
    case "yearly": {
      next = new Date(ref);
      if (!isFirst) next.setFullYear(next.getFullYear() + 1);
      const moy = (template.monthOfYear ?? 1) - 1;
      next.setMonth(moy);
      const dom = template.dayOfMonth ?? 1;
      const lastDay = lastDayOfMonth(next.getFullYear(), next.getMonth());
      next.setDate(dom === -1 ? lastDay : Math.min(dom, lastDay));
      break;
    }
    case "weekly":
    case "biweekly": {
      const stepDays = template.frequency === "weekly" ? 7 : 14;
      const targetDow = template.dayOfWeek ?? ref.getDay();
      next = new Date(ref);
      if (isFirst) {
        // Primer hit en o después de startDate con el targetDow.
        const diff = (targetDow - next.getDay() + 7) % 7;
        next.setDate(next.getDate() + diff);
      } else {
        next.setDate(next.getDate() + stepDays);
      }
      break;
    }
    default:
      return null;
  }

  if (template.endDate && next > template.endDate) return null;
  return next;
}

function templateToDraftInput(t: FinanceDteRecurringTemplate): DraftDteInput {
  return {
    dteType: t.dteType,
    receiverRut: t.receiverRut,
    receiverName: t.receiverName,
    receiverEmail: t.receiverEmail ?? undefined,
    receiverEmailCc: t.receiverEmailCc,
    receiverGiro: t.receiverGiro ?? undefined,
    receiverDireccion: t.receiverDireccion ?? undefined,
    receiverComuna: t.receiverComuna ?? undefined,
    receiverCiudad: t.receiverCiudad ?? undefined,
    crmAccountId: t.crmAccountId ?? undefined,
    installationId: t.installationId ?? undefined,
    currency: t.currency,
    lines: (t.lines as DraftDteInput["lines"]) ?? [],
    notes: t.notes ?? undefined,
    additionalReferences: (t.additionalReferences as DraftDteInput["additionalReferences"]) ?? undefined,
    autoSendEmail: t.autoSendEmail,
  };
}

/**
 * Ejecuta una corrida del template: crea un borrador (FinanceDte DRAFT)
 * y registra el run. Si el cliente CRM fue eliminado, el run queda
 * status=failed y NO se crea borrador.
 */
export async function runTemplate(tenantId: string, templateId: string) {
  const template = await prisma.financeDteRecurringTemplate.findFirst({
    where: { id: templateId, tenantId },
  });
  if (!template) throw new Error("Template no encontrado");
  if (!template.isActive) {
    return prisma.financeDteRecurringRun.create({
      data: { tenantId, templateId, status: "skipped_inactive" },
    });
  }
  if (template.endDate && template.endDate < new Date()) {
    return prisma.financeDteRecurringRun.create({
      data: { tenantId, templateId, status: "skipped_endDate" },
    });
  }

  // Si la plantilla referencia un CRM account, validar que exista.
  if (template.crmAccountId) {
    const account = await prisma.crmAccount.findFirst({
      where: { id: template.crmAccountId, tenantId },
      select: { id: true },
    });
    if (!account) {
      return prisma.financeDteRecurringRun.create({
        data: {
          tenantId,
          templateId,
          status: "failed",
          error: "Cliente CRM referenciado por la plantilla ya no existe",
        },
      });
    }
  }

  try {
    // Si la plantilla es UF, resolvemos la UF según la policy ANTES
    // de crear el draft. Esto "fija" la UF que verá el borrador (queda
    // congelada en `ufValueAtIssue` y no cambia aunque el usuario emita
    // días después).
    let ufOverride: number | undefined = undefined;
    if (template.currency === "UF") {
      const policy = (template.ufFixingPolicy as UfFixingPolicy) ?? "RUN_DAY";
      const ufDate = resolveUfDateForPolicy(policy, template.ufFixingDay);
      if (ufDate) {
        const { getUfValueForDate } = await import("@/lib/uf");
        ufOverride = await getUfValueForDate(ufDate);
      }
      // Si policy es RUN_DAY, ufOverride queda undefined → el helper
      // computeDteAmounts dentro de createDraftDte llamará a
      // getUfValue() (UF del día), que es el comportamiento previo.
    }

    const draft = await createDraftDte(
      tenantId,
      template.createdBy,
      templateToDraftInput(template),
      { ufOverride },
    );
    const next = computeNextRunAt(template);
    await prisma.financeDteRecurringTemplate.update({
      where: { id: templateId },
      data: {
        lastRunAt: new Date(),
        nextRunAt: next,
        runCount: { increment: 1 },
      },
    });
    return prisma.financeDteRecurringRun.create({
      data: { tenantId, templateId, dteId: draft.id, status: "success" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return prisma.financeDteRecurringRun.create({
      data: { tenantId, templateId, status: "failed", error: message },
    });
  }
}

/**
 * Procesa todos los templates activos cuyo nextRunAt <= today para un
 * tenant. Idempotente: si lastRunAt = today, los salta.
 */
export async function processDueTemplates(
  tenantId: string,
  today?: Date,
): Promise<{ successCount: number; failedCount: number; skippedCount: number }> {
  const now = today ?? new Date();
  now.setHours(23, 59, 59, 999);

  const templates = await prisma.financeDteRecurringTemplate.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
  });

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const t of templates) {
    // Idempotency guard: si lastRunAt y nextRunAt ya están sincronizados
    // (lastRunAt = today o futuro), saltamos.
    if (t.lastRunAt) {
      const last = new Date(t.lastRunAt);
      last.setHours(0, 0, 0, 0);
      const nowFloor = new Date(now);
      nowFloor.setHours(0, 0, 0, 0);
      if (last.getTime() === nowFloor.getTime()) {
        skippedCount += 1;
        continue;
      }
    }
    const run = await runTemplate(tenantId, t.id);
    if (run.status === "success") successCount += 1;
    else if (run.status === "failed") failedCount += 1;
    else skippedCount += 1;
  }

  return { successCount, failedCount, skippedCount };
}
