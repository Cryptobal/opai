const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface AttendanceMetricsInput {
  plannedShiftStart?: string | null;
  plannedShiftEnd?: string | null;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  colacionMinutes?: number;
}

export interface AttendanceMetrics {
  plannedMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
}

export function parseTimeToMinutes(time: string): number | null {
  const match = time.match(TIME_REGEX);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  return hh * 60 + mm;
}

export function diffMinutesAcrossMidnight(start: number, end: number): number {
  if (end >= start) return end - start;
  return 24 * 60 - start + end;
}

export function computePlannedMinutes(
  shiftStart?: string | null,
  shiftEnd?: string | null,
  colacionMinutes = 60
): number {
  if (!shiftStart || !shiftEnd) return 0;
  const start = parseTimeToMinutes(shiftStart);
  const end = parseTimeToMinutes(shiftEnd);
  if (start == null || end == null) return 0;
  const gross = diffMinutesAcrossMidnight(start, end);
  const net = gross - Math.max(0, colacionMinutes);
  return Math.max(0, net);
}

export function computeWorkedMinutes(
  checkInAt?: Date | null,
  checkOutAt?: Date | null,
  colacionMinutes = 60
): number {
  if (!checkInAt || !checkOutAt) return 0;
  let diff = Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
  if (diff < 0) {
    // Shift de noche: salida el día siguiente.
    diff += 24 * 60;
  }
  const net = diff - Math.max(0, colacionMinutes);
  return Math.max(0, net);
}

export function computeLateMinutes(
  checkInAt?: Date | null,
  plannedShiftStart?: string | null
): number {
  if (!checkInAt || !plannedShiftStart) return 0;
  const plannedStart = parseTimeToMinutes(plannedShiftStart);
  if (plannedStart == null) return 0;
  const checkInMinutes = checkInAt.getUTCHours() * 60 + checkInAt.getUTCMinutes();
  return Math.max(0, checkInMinutes - plannedStart);
}

export function computeAttendanceMetrics(
  input: AttendanceMetricsInput
): AttendanceMetrics {
  const colacionMinutes = input.colacionMinutes ?? 60;
  const plannedMinutes = computePlannedMinutes(
    input.plannedShiftStart,
    input.plannedShiftEnd,
    colacionMinutes
  );
  const workedMinutes = computeWorkedMinutes(
    input.checkInAt,
    input.checkOutAt,
    colacionMinutes
  );
  const overtimeMinutes = Math.max(0, workedMinutes - plannedMinutes);
  const lateMinutes = computeLateMinutes(input.checkInAt, input.plannedShiftStart);

  return {
    plannedMinutes,
    workedMinutes,
    overtimeMinutes,
    lateMinutes,
  };
}
