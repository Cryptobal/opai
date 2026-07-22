import "server-only";
import { prisma } from "@/lib/prisma";
import type { FinanceDteRecurringTemplate } from "@prisma/client";
import { computeNextRunAt } from "@/modules/finance/billing/dte-recurring-schedule";
import { syncRecurringDteItem } from "@/modules/finance/cashflow/generators/recurring-dte-sync";

/**
 * Aplazar/fijar el término de una programación desde la planilla.
 * No existe un update service en billing (el CRUD vive inline en la API de
 * recurring), así que este service enfocado replica sus invariantes:
 *  - endDate nuevo > hoy sobre una plantilla auto-terminada (isActive=false y
 *    nextRunAt=null tras pasar su término) la REACTIVA y recalcula nextRunAt.
 *  - endDate nuevo que deja nextRunAt fuera de rango → nextRunAt=null y la
 *    plantilla se desactiva (mismo criterio que runTemplate).
 *  - Siempre re-sincroniza el espejo del módulo viejo (syncRecurringDteItem)
 *    para que ambas UIs sigan coherentes mientras convivan.
 */
export async function updateTemplateEndDate(
  tenantId: string,
  templateId: string,
  endDateYmd: string | null,
): Promise<FinanceDteRecurringTemplate> {
  const tpl = await prisma.financeDteRecurringTemplate.findFirst({
    where: { id: templateId, tenantId },
  });
  if (!tpl) throw new Error("Programación no encontrada");

  // La planilla solo gestiona programaciones vinculadas a una fila del tenant
  // (cuenta CRM con fila propia o genérica).
  if (tpl.crmAccountId) {
    const row = await prisma.financeFlowRow.findFirst({
      where: { tenantId, crmAccountId: tpl.crmAccountId },
      select: { id: true },
    });
    if (!row) throw new Error("La programación no está vinculada a una fila de la planilla");
  }

  const endDate = endDateYmd ? new Date(`${endDateYmd}T00:00:00.000Z`) : null;
  if (endDate && Number.isNaN(endDate.getTime())) throw new Error("endDate inválida");
  if (endDate && endDate < tpl.startDate) {
    throw new Error("endDate no puede ser anterior al inicio de la programación");
  }

  const wasEnded = !tpl.isActive && tpl.nextRunAt == null && tpl.lastRunAt != null;
  const candidate = { ...tpl, endDate };

  // nextRunAt bajo el nuevo término: si el actual sigue válido se conserva;
  // si quedó fuera (o no había), se recalcula desde lastRunAt/startDate.
  let nextRunAt = tpl.nextRunAt;
  if (nextRunAt && endDate && nextRunAt > endDate) nextRunAt = null;
  if (!nextRunAt) nextRunAt = computeNextRunAt(candidate);

  const today = new Date();
  const shouldReactivate = wasEnded && nextRunAt != null && (!endDate || endDate >= today);
  // Sin próxima corrida posible bajo el nuevo término → apagar SIEMPRE
  // (incluida una plantilla nunca corrida: si quedara activa con
  // lastRunAt=null y nextRunAt=null, el cron la trataría como "nueva sin
  // schedule" y la correría igual).
  const shouldDeactivate = tpl.isActive && nextRunAt == null;

  await prisma.financeDteRecurringTemplate.update({
    where: { id: tpl.id },
    data: {
      endDate,
      nextRunAt,
      ...(shouldReactivate ? { isActive: true } : {}),
      ...(shouldDeactivate ? { isActive: false } : {}),
    },
  });

  // Espejo del módulo viejo (FinanceCashflowItem RECURRING_DTE) sigue vivo
  // mientras convivan ambas UIs.
  await syncRecurringDteItem(tenantId, tpl.id);

  // Read-after-write.
  return prisma.financeDteRecurringTemplate.findFirstOrThrow({
    where: { id: tpl.id, tenantId },
  });
}
