/**
 * Resuelve el nombre de fila de flujo para mostrar en Bancos / bandejas.
 * Prioriza flowRowId persistido en el link; el fallback por accountPlanId
 * es ambiguo cuando varias filas comparten cuenta (Aporte vs Devolución socios).
 *
 * El drawer de conciliación muestra el `note` del link ("Clasificado a fila flujo: …").
 * La lista/tooltip usa `flowRowName` enriquecido acá — deben converger.
 */

/** Patrón generado por classify-suggestions al clasificar manualmente. */
const CLASSIFY_NOTE_RE =
  /Clasificado a fila(?: flujo)?:\s*(.+?)(?:\s*\(|$)/i;

/** Extrae el nombre legible de fila desde la nota de clasificación manual. */
export function parseFlowRowNameFromClassifyNote(
  note: string | null | undefined,
): string | null {
  if (!note) return null;
  const m = note.match(CLASSIFY_NOTE_RE);
  const name = m?.[1]?.trim();
  return name || null;
}

export function resolveFlowRowDisplayName(
  link: {
    flowRowId: string | null;
    accountPlanId: string | null;
    note?: string | null;
  },
  flowRowNamesById: Map<string, string>,
  flowRowNameByAccountLegacy: Map<string, string>,
): string | null {
  if (link.flowRowId) {
    const byId = flowRowNamesById.get(link.flowRowId);
    if (byId) return byId;
    // flowRowId persistido pero fila no cargada (archivada, etc.): no caer al
    // fallback ambiguo por cuenta compartida (Aporte vs Devolución socios).
    const fromNote = parseFlowRowNameFromClassifyNote(link.note);
    if (fromNote) return fromNote;
    return null;
  }

  const fromNote = parseFlowRowNameFromClassifyNote(link.note);
  if (fromNote) return fromNote;

  if (link.accountPlanId) {
    return flowRowNameByAccountLegacy.get(link.accountPlanId) ?? null;
  }
  return null;
}

/**
 * Campos de clasificación que consume la lista de Bancos (columna Estado +
 * tooltip). Centraliza la misma lógica que `listBankTransactions`.
 */
export function buildBankTxLinkDisplayFields(
  link:
    | {
        flowRowId: string | null;
        accountPlanId: string | null;
        note: string | null;
        accountPlan?: { code: string; name: string } | null;
      }
    | undefined,
  maps: {
    flowRowNamesById: Map<string, string>;
    flowRowNameByAccount: Map<string, string>;
  },
): { flowRowName: string | null; linkAccountLabel: string | null } {
  if (!link) {
    return { flowRowName: null, linkAccountLabel: null };
  }

  const linkAccountCode = link.accountPlan?.code ?? null;
  const linkAccountName = link.accountPlan?.name ?? null;
  const linkAccountLabel =
    linkAccountCode && linkAccountName
      ? `${linkAccountCode} · ${linkAccountName}`
      : linkAccountCode ?? linkAccountName ?? null;

  const flowRowName = resolveFlowRowDisplayName(
    {
      flowRowId: link.flowRowId,
      accountPlanId: link.accountPlanId,
      note: link.note,
    },
    maps.flowRowNamesById,
    maps.flowRowNameByAccount,
  );

  return { flowRowName, linkAccountLabel };
}
