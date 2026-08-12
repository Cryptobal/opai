/**
 * Resuelve el nombre de fila de flujo para mostrar en Bancos / bandejas.
 * Prioriza flowRowId persistido en el link; el fallback por accountPlanId
 * es ambiguo cuando varias filas comparten cuenta (Aporte vs Devolución socios).
 */
export function resolveFlowRowDisplayName(
  link: { flowRowId: string | null; accountPlanId: string | null },
  flowRowNamesById: Map<string, string>,
  flowRowNameByAccountLegacy: Map<string, string>,
): string | null {
  if (link.flowRowId) {
    const byId = flowRowNamesById.get(link.flowRowId);
    if (byId) return byId;
  }
  if (link.accountPlanId) {
    return flowRowNameByAccountLegacy.get(link.accountPlanId) ?? null;
  }
  return null;
}
