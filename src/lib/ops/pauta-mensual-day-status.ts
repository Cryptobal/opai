/**
 * Estado visual de asistencia en el encabezado de Pauta Mensual.
 *
 * Semáforo solo hasta hoy (Chile):
 * - verde  = todos los puestos de trabajo del día tienen asistencia registrada
 * - ámbar  = hay turnos planificados y falta al menos uno (incluye hoy sin marcas)
 * - rojo   = día ya pasado, con turnos planificados y cero asistencia
 * - neutro = futuro, o día sin turnos planificados
 */

export type DayAttendanceStatus = "ok" | "partial" | "pending" | "none" | "future";

export type DayAttendanceTone = {
  label: string;
  buttonClass: string;
  barClass: string;
};

const TONE_OK: DayAttendanceTone = {
  label: "completa",
  buttonClass: "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
  barClass: "bg-status-ok-fg",
};

const TONE_PARTIAL: DayAttendanceTone = {
  label: "parcial",
  buttonClass: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
  barClass: "bg-status-warn-fg",
};

const TONE_PENDING: DayAttendanceTone = {
  label: "sin asistencia",
  buttonClass: "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
  barClass: "bg-status-danger-fg",
};

const TONE_NEUTRAL: DayAttendanceTone = {
  label: "sin turnos",
  buttonClass: "bg-transparent text-muted-foreground/60 border-dashed border-muted-foreground/40",
  barClass: "bg-transparent",
};

const TONE_FUTURE: DayAttendanceTone = {
  label: "día futuro",
  buttonClass: "bg-transparent text-muted-foreground/60 border-dashed border-muted-foreground/40",
  barClass: "bg-transparent",
};

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
