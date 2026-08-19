/**
 * Estado de asistencia en el encabezado de Pauta Mensual.
 *
 * El número del día conserva el color de calendario (semana / finde / feriado).
 * El semáforo es un punto aparte, solo hasta hoy (Chile):
 * - verde  = todos los turnos de trabajo del día tienen ASI o TE
 * - ámbar  = hay turnos planificados y falta al menos un ASI/TE (incluye hoy sin marcas)
 * - rojo   = día ya pasado, con turnos planificados y cero ASI/TE
 * - sin punto = futuro, o día sin turnos planificados
 *
 * PPC (vacante) y SC (marcado ausente) no cuentan como asistencia: si un día
 * pasado solo tiene esos estados, el punto es rojo, no ámbar.
 */

export type ExecutionAttendanceState = "asistio" | "te" | "sin_cobertura" | "ppc";

export type DayAttendanceStatus = "ok" | "partial" | "pending" | "none" | "future";

/** Alineado con `StatusKind` de opai-ds, sin importar el DS desde lib. */
export type DayAttendanceDotKind = "ok" | "warn" | "danger";

export type DayAttendanceTone = {
  label: string;
  /** `null` = no renderizar el punto. */
  dotKind: DayAttendanceDotKind | null;
};

const TONE_OK: DayAttendanceTone = { label: "completa", dotKind: "ok" };
const TONE_PARTIAL: DayAttendanceTone = { label: "parcial", dotKind: "warn" };
const TONE_PENDING: DayAttendanceTone = { label: "sin asistencia", dotKind: "danger" };
const TONE_NEUTRAL: DayAttendanceTone = { label: "sin turnos", dotKind: null };
const TONE_FUTURE: DayAttendanceTone = { label: "día futuro", dotKind: null };

/** Solo ASI y TE cubren el turno. PPC/SC/pendiente no. */
export function isAttendedExecution(
  state?: ExecutionAttendanceState | string | null,
): boolean {
  return state === "asistio" || state === "te";
}

/**
 * Resuelve el estado de un día.
 * `dateKey` y `todayKey` son YYYY-MM-DD comparables lexicográficamente.
 * `resolved` debe ser el recuento de turnos con ASI/TE, no cualquier execution.
 */
export function resolveDayAttendanceStatus(params: {
  dateKey: string;
  todayKey: string;
  planned: number;
  resolved: number;
}): DayAttendanceStatus {
  const { dateKey, todayKey, planned, resolved } = params;
  if (dateKey > todayKey) return "future";
  if (planned <= 0) return "none";
  if (resolved <= 0) {
    // Hoy todavía está en curso: cero marcas = falta asistencia (ámbar), no alarma roja.
    return dateKey < todayKey ? "pending" : "partial";
  }
  if (resolved >= planned) return "ok";
  return "partial";
}

export function dayAttendanceTone(status: DayAttendanceStatus): DayAttendanceTone {
  switch (status) {
    case "ok":
      return TONE_OK;
    case "partial":
      return TONE_PARTIAL;
    case "pending":
      return TONE_PENDING;
    case "future":
      return TONE_FUTURE;
    case "none":
    default:
      return TONE_NEUTRAL;
  }
}
