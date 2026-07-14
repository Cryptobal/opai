/**
 * Referencias adicionales (no-DTE) de un documento: OC, HES, Contrato,
 * Resolución, Guía de Despacho manual, etc. Se persisten como JSON en
 * `FinanceDte.additionalReferences` (array de objetos), separadas de la
 * referencia escalar al DTE original (referenceType/referenceFolio).
 *
 * Este módulo es puro (sin JSX ni "use client") para poder importarse
 * tanto en el loader server-side (page.tsx) como en el cliente.
 */

export interface DteAdditionalRef {
  /** TpoDocRef SII: numérico ("801") o alfanumérico ("HES", "GD"). */
  tipoDocRef: string;
  /** FolioRef: alfanumérico (n° de OC, HES, contrato...). Puede venir "". */
  folioRef: string;
  /** FchRef: "YYYY-MM-DD" o "". */
  fchRef: string;
  /** RazonRef: texto libre (max 90). Puede venir "". */
  razonRef: string;
}

/**
 * Etiquetas compactas para el TpoDocRef, pensadas para badges de tabla.
 * Para labels largos (detalle) ver REF_TYPE_LABELS en IssuedDteDetailDialog.
 */
const COMPACT_REF_LABELS: Record<string, string> = {
  "801": "OC",
  "802": "Pedido",
  "803": "Contrato",
  "804": "Resolución",
  HES: "HES",
  GD: "Guía",
  "52": "Guía",
};

/** Etiqueta compacta para mostrar en un badge. Cae al código crudo si no mapea. */
export function refTypeLabel(tipoDocRef: string): string {
  return COMPACT_REF_LABELS[tipoDocRef] ?? tipoDocRef;
}

/**
 * Normaliza el JSON crudo de `additionalReferences` a un array tipado y
 * defensivo. Descarta entradas sin `tipoDocRef` (dato mínimo requerido).
 */
export function normalizeAdditionalRefs(raw: unknown): DteAdditionalRef[] {
  if (!Array.isArray(raw)) return [];
  const out: DteAdditionalRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const tipoDocRef =
      typeof r.tipoDocRef === "string"
        ? r.tipoDocRef.trim()
        : String(r.tipoDocRef ?? "").trim();
    if (!tipoDocRef) continue;
    out.push({
      tipoDocRef,
      folioRef: r.folioRef != null ? String(r.folioRef).trim() : "",
      fchRef: typeof r.fchRef === "string" ? r.fchRef : "",
      razonRef: typeof r.razonRef === "string" ? r.razonRef : "",
    });
  }
  return out;
}
