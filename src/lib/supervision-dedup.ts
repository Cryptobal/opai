/**
 * Dedup de hallazgos de supervisión.
 *
 * Jerarquía de identificación:
 *   1. tipoDocId     → "doc:<uuid>"
 *   2. guardiaDocCode → "guardia:<guardId|null>:<code>"
 *   3. descripción    → "desc:<normalizada>"
 *
 * La normalización del fallback replica exactamente el backfill SQL
 * (unaccent + lowercase + non-alphanum → espacio + trim + 120 chars).
 */
export function computeFindingDedupKey(args: {
  tipoDocId?: string | null;
  guardId?: string | null;
  guardiaDocCode?: string | null;
  description: string;
}): string {
  const { tipoDocId, guardId, guardiaDocCode, description } = args;
  if (tipoDocId) return `doc:${tipoDocId}`;
  if (guardiaDocCode) return `guardia:${guardId ?? "null"}:${guardiaDocCode}`;
  const normalized = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 120);
  return `desc:${normalized}`;
}

/** Estados "activos" de un finding (cuenta para dedup). */
export const ACTIVE_FINDING_STATUSES = ["open", "in_progress"] as const;

/** Estados terminales de un ticket (no se reabre, se crea uno nuevo). */
export const TERMINAL_TICKET_STATUSES = [
  "resolved",
  "closed",
  "cancelled",
  "rejected",
] as const;
