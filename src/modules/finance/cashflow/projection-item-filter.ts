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
 * Fuente de verdad para placement en flujo de caja: al flujo SOLO entran los
 * DTE (recurrentes y emitidos) y los borradores de factura.
 *
 * - `source=CONTRACT` NO entra NUNCA: el contrato por sí mismo no proyecta.
 *   Un contrato sin DTE recurrente emitido no aparece en el flujo. El item
 *   CONTRACT sigue existiendo en DB (tab Contratos CRM) como metadato, pero no
 *   genera fila ni engancha facturas: una factura emitida de un contrato sin
 *   programación recurrente cae a su propia fila (Path 2 del proyector) con su
 *   monto real. Las facturas recurrentes se proyectan desde `RECURRING_DTE`.
 * - `OTHER` con `sourceRefId` (contrato-like legacy) se oculta solo cuando hay
 *   un espejo recurrente activo para la misma cuenta+instalación.
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
    // El contrato no entra al flujo: mandan los DTE recurrentes/emitidos.
    if (i.source === "CONTRACT") return false;
    if (!isContractLikeItem(i) || !i.crmAccountId) return true;
    return !recurringKeys.has(installKey(i.crmAccountId, i.installationId));
  });
}
