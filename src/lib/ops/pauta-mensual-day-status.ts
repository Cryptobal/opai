/**
 * Estado de asistencia en el encabezado de Pauta Mensual.
 *
 * El número del día conserva el color de calendario (semana / finde / feriado).
 * El semáforo es un punto aparte, solo hasta hoy (Chile):
 * - verde  = todos los puestos de trabajo del día tienen asistencia registrada
 * - ámbar  = hay turnos planificados y falta al menos uno (incluye hoy sin marcas)
 * - rojo   = día ya pasado, con turnos planificados y cero asistencia
 * - sin punto = futuro, o día sin turnos planificados
 */

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

/**
 * Resuelve el estado de un día.
 * `dateKey` y `todayKey` son YYYY-MM-DD comparables lexicográficamente.
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
