export type DigitalStatus = "ok" | "alerta" | "falta";
export type FisicoStatus = "ok" | "pendiente" | "falta";

export type CellStatus = {
  digital: DigitalStatus;
  fisico: FisicoStatus;
};

/**
 * Derive cell display status from digital doc status + last physical verification.
 * @param digitalStatus - "vigente" | "por_vencer" | "vencido" | "sin_documento" | "no_aplica"
 * @param fisicaPresente - true=found, false=not found, null=never checked
 */
export function calcCellStatus(
  digitalStatus: string,
  fisicaPresente: boolean | null,
): CellStatus {
  let digital: DigitalStatus;
  if (digitalStatus === "vigente") {
    digital = "ok";
  } else if (digitalStatus === "por_vencer") {
    digital = "alerta";
  } else {
    digital = "falta";
  }

  let fisico: FisicoStatus;
  if (fisicaPresente === true) {
    fisico = "ok";
  } else if (fisicaPresente === false) {
    fisico = "falta";
  } else {
    fisico = "pendiente";
  }

  return { digital, fisico };
}

/**
 * Calculate compliance percentage across cells.
 * Each cell has 2 dimensions; "ok" counts as 1 point.
 */
export function calcCompliancePercent(cells: CellStatus[]): number {
  if (cells.length === 0) return 0;
  const total = cells.length * 2;
  let greens = 0;
  for (const c of cells) {
    if (c.digital === "ok") greens++;
    if (c.fisico === "ok") greens++;
  }
  return Math.round((greens / total) * 100);
}
