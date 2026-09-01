export const TIME_SYNC_OK_MS = 60_000;
export const TIME_SYNC_WARN_MS = 300_000;
export const TIME_SYNC_RTT_MAX_MS = 2_000;
export const TIME_SYNC_FETCH_TIMEOUT_MS = 5_000;
export const TIME_SYNC_RETENTION_YEARS = 5;
export const TIME_SYNC_INCIDENT_PREFIX = "[Art. 11] Desfase horario";

export type TimeSyncStatus = "ok" | "warn" | "alert";
export type TimeSyncSource = "shoa" | "cloudflare" | "none";

export function classifyDrift(
  driftMs: number | null,
  hasReference: boolean,
): TimeSyncStatus {
  if (!hasReference || driftMs == null) return "warn";
  const abs = Math.abs(driftMs);
  if (abs <= TIME_SYNC_OK_MS) return "ok";
  if (abs <= TIME_SYNC_WARN_MS) return "warn";
  return "alert";
}

/** Punto medio del RTT: desfase = hora local en el medio del round-trip − referencia. */
export function driftWithRttCompensation(
  t0Ms: number,
  t1Ms: number,
  referenceMs: number,
): { rttMs: number; driftMs: number } {
  const rttMs = Math.max(0, t1Ms - t0Ms);
  const serverMid = t0Ms + rttMs / 2;
  return { rttMs, driftMs: Math.round(serverMid - referenceMs) };
}

export function shouldDiscardRtt(rttMs: number): boolean {
  return rttMs > TIME_SYNC_RTT_MAX_MS;
}

/**
 * Reintenta el correo mientras el incidente de desfase no tenga una entrega
 * exitosa. Tras recuperarse a `ok`, un nuevo `alert` vuelve a notificar.
 */
export function shouldNotifyDriftAlert(input: {
  status: TimeSyncStatus;
  /** Instante de BD (`createdAt` / `notifiedAt`), nunca el `checkedAt` medido. */
  lastNotifiedAt: Date | null;
  lastOkAt: Date | null;
}): boolean {
  if (input.status !== "alert") return false;
  if (input.lastNotifiedAt == null) return true;
  if (input.lastOkAt == null) return false;
  return input.lastNotifiedAt.getTime() < input.lastOkAt.getTime();
}
