/**
 * Deep-link desde una celda del flujo (DTE recurrente) hacia la plantilla
 * en Facturación → Programación. El destino resuelve `sourceRefId` (template)
 * a partir del FinanceCashflowItem.
 */

import { unwrapProgItemId } from "./cashflow-move";
import { isRealItemId } from "./grid-helpers";
import type { FinanceCashflowItemSource } from "@/modules/finance/cashflow/types";

/** Item real (UUID o `_prog:<uuid>:…`) usable para abrir la programación. */
export function resolveCashflowItemIdForProgramacion(
  itemId: string | null | undefined,
): string | null {
  const unwrapped = unwrapProgItemId(itemId ?? null);
  if (unwrapped && isRealItemId(unwrapped)) return unwrapped;
  if (isRealItemId(itemId)) return itemId ?? null;
  return null;
}

/** Href a Programación que abre la plantilla del ítem RECURRING_DTE. */
export function programacionHrefForCashflowItem(
  source: FinanceCashflowItemSource | null | undefined,
  itemId: string | null | undefined,
): string | null {
  if (source !== "RECURRING_DTE") return null;
  const id = resolveCashflowItemIdForProgramacion(itemId);
  if (!id) return null;
  return `/finanzas/facturacion/programacion?openCashflowItem=${encodeURIComponent(id)}`;
}
