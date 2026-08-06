/**
 * Tipos y helpers de sugerencias de clasificación para la bandeja (Bloque 8).
 * Cliente-only: consume el batch POST y formatea identidad / estado.
 */

export type ClassifySuggestionSource = "rule" | "payroll" | "te" | "heuristic";

export type BandejaSuggestionKind =
  | "FLOW_ROW"
  | "TGR_PICK"
  | "DTE_RECEIVED"
  | "NONE";

export interface BandejaTxIdentity {
  kind: "client" | "factoring" | "supplier" | "guardia" | "unknown";
  name: string | null;
  guardiaState: {
    status: string;
    lifecycleStatus: string;
    terminatedAt: string | null;
    installationName: string | null;
    availableExtraShifts: boolean;
  } | null;
  alsoRegisteredAs: Array<"client" | "guardia" | "supplier" | "factoring">;
}

export interface BandejaTxSuggestion {
  kind: BandejaSuggestionKind;
  flowRowId?: string;
  dteId?: string;
  label: string | null;
  reason: string;
  source: ClassifySuggestionSource | null;
  requiresReview?: boolean;
  options?: Array<"F29" | "FINIQUITO" | "CONVENIO_TGR">;
}

export interface BandejaTxSuggestionResult {
  id: string;
  rut: string | null;
  identity: BandejaTxIdentity;
  suggestion: BandejaTxSuggestion;
}

export const BATCH_SUGGESTIONS_MAX = 300;

/** Badge de estado laboral (misma copy que BancosClient). */
export function formatGuardiaStateBadge(
  state: NonNullable<BandejaTxIdentity["guardiaState"]>,
): string {
  if (state.terminatedAt || state.lifecycleStatus === "inactivo") {
    if (state.terminatedAt) {
      const [y, m, d] = state.terminatedAt.split("-");
      const short = `${d}/${m}/${y?.slice(2) ?? ""}`;
      return `Finiquitado ${short}`;
    }
    return "Finiquitado";
  }
  if (!state.installationName) return "Guardia sin puesto";
  return `Guardia activo · ${state.installationName}`;
}

export function identityKindLabel(kind: BandejaTxIdentity["kind"]): string {
  switch (kind) {
    case "guardia":
      return "Guardia";
    case "client":
      return "Cliente";
    case "supplier":
      return "Proveedor";
    case "factoring":
      return "Factoring";
    default:
      return "Sin identidad";
  }
}

/** learnRule al aceptar sugerencias automáticas (nómina/TE no aprenden). */
export function learnRuleForSuggestionSource(
  source: ClassifySuggestionSource | null | undefined,
): "NONE" | "RUT" {
  if (source === "payroll" || source === "te") return "NONE";
  if (source === "rule") return "NONE";
  // heuristic: no aprender al aceptar; el aprendizaje es por asignación manual
  return "NONE";
}

/**
 * Carga sugerencias en lotes de 300. Devuelve mapa id → resultado.
 * Lanza Error con mensaje de API si algún lote falla.
 */
export async function fetchBandejaSuggestionsBatch(
  bankTransactionIds: string[],
  opts?: {
    onChunk?: (loaded: number, total: number) => void;
    signal?: AbortSignal;
  },
): Promise<Map<string, BandejaTxSuggestionResult>> {
  const unique = [...new Set(bankTransactionIds)];
  const map = new Map<string, BandejaTxSuggestionResult>();
  if (unique.length === 0) return map;

  let loaded = 0;
  for (let i = 0; i < unique.length; i += BATCH_SUGGESTIONS_MAX) {
    if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const chunk = unique.slice(i, i + BATCH_SUGGESTIONS_MAX);
    const res = await fetch(
      "/api/finance/banking/transactions/classify-suggestions/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankTransactionIds: chunk }),
        signal: opts?.signal,
      },
    );
    const j = (await res.json()) as {
      success?: boolean;
      error?: string;
      data?: BandejaTxSuggestionResult[];
    };
    if (!res.ok || !j.success || !Array.isArray(j.data)) {
      throw new Error(j.error ?? "No se pudieron cargar las sugerencias");
    }
    for (const row of j.data) {
      map.set(row.id, row);
    }
    loaded += chunk.length;
    opts?.onChunk?.(loaded, unique.length);
  }
  return map;
}

export function suggestionHasFlowDestination(
  s: BandejaTxSuggestion | undefined,
): s is BandejaTxSuggestion & { kind: "FLOW_ROW"; flowRowId: string } {
  return s?.kind === "FLOW_ROW" && typeof s.flowRowId === "string" && !!s.flowRowId;
}

/** Texto de destino para la UI; nunca vacío. */
export function formatSuggestionDestino(s: BandejaTxSuggestion | undefined): string {
  if (!s) return "Sin sugerencia";
  if (s.kind === "FLOW_ROW") return s.label?.trim() || "Fila de flujo";
  if (s.kind === "TGR_PICK") return s.label?.trim() || "Tesorería";
  if (s.kind === "DTE_RECEIVED") return s.label?.trim() || "Factura recibida";
  return "Sin sugerencia";
}

export function formatSuggestionMotivo(s: BandejaTxSuggestion | undefined): string {
  if (!s) return "Todavía no hay propuesta para este movimiento";
  return s.reason?.trim() || "Sin motivo";
}

export function alsoRegisteredAsLabel(
  kinds: BandejaTxIdentity["alsoRegisteredAs"],
): string {
  const labels: Record<string, string> = {
    client: "cliente",
    guardia: "guardia",
    supplier: "proveedor",
    factoring: "factoring",
  };
  return kinds.map((k) => labels[k] ?? k).join(", ");
}
