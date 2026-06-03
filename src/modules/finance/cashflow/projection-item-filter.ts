import "server-only";
import type { FinanceCashflowItem } from "@prisma/client";

type CashflowItemLike = Pick<
  FinanceCashflowItem,
  "source" | "crmAccountId" | "installationId" | "sourceRefId"
>;

function installKey(crmAccountId: string, installationId: string | null): string {
  return `${crmAccountId}|${installationId ?? ""}`;
}

function isContractLikeItem(it: CashflowItemLike): boolean {
  return (
    it.source === "CONTRACT" ||
    (it.source === "OTHER" && it.sourceRefId != null)
  );
}

/**
 * Fuente de verdad para placement en flujo de caja: Programación recurrente
 * (`RECURRING_DTE` espejo de FinanceDteRecurringTemplate). Si hay al menos
 * un espejo recurrente activo para cliente+instalación, el ítem CONTRACT del
 * tab Contratos CRM no se proyecta (evita día de pago legacy vs dayOfMonth de
 * la plantilla). Sin recurrente, el CONTRACT sigue proyectando solo.
 */
export function filterCashflowItemsForProjection<T extends CashflowItemLike>(
  items: T[],
): T[] {
  const recurringKeys = new Set<string>();
  for (const it of items) {
    if (it.source === "RECURRING_DTE" && it.crmAccountId) {
      recurringKeys.add(installKey(it.crmAccountId, it.installationId));
    }
  }
  return items.filter((i) => {
    if (!isContractLikeItem(i) || !i.crmAccountId) return true;
    return !recurringKeys.has(installKey(i.crmAccountId, i.installationId));
  });
}
