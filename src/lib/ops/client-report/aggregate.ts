import {
  ABSENT_ATTENDANCE,
  COVERED_ATTENDANCE,
  UNCOVERED_ATTENDANCE,
  COMPLETED_RONDA,
  TERMINAL_TICKET,
  type AttendanceSlotRow,
  type DigestKpis,
} from "./types";

export function pct(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 100);
}

export function aggregateAttendance(slots: AttendanceSlotRow[]): {
  covered: number;
  absent: number;
  uncovered: number;
  total: number;
  asistenciaPct: number | null;
  coberturaPct: number | null;
} {
  let covered = 0;
  let absent = 0;
  let uncovered = 0;
  for (const slot of slots) {
    const s = (slot.attendanceStatus || "").toLowerCase();
    if (COVERED_ATTENDANCE.has(s)) covered += 1;
    else if (ABSENT_ATTENDANCE.has(s)) absent += 1;
    else if (UNCOVERED_ATTENDANCE.has(s)) uncovered += 1;
    else uncovered += 1;
  }
  const total = slots.length;
  const attendedDenom = covered + absent;
  return {
    covered,
    absent,
    uncovered,
    total,
    asistenciaPct: pct(covered, attendedDenom),
    coberturaPct: pct(covered, total),
  };
}

export function aggregateRondas(statuses: string[]): {
  completed: number;
  total: number;
  pct: number | null;
} {
  const total = statuses.length;
  const completed = statuses.filter((s) =>
    COMPLETED_RONDA.has(s.toLowerCase())
  ).length;
  return { completed, total, pct: pct(completed, total) };
}

export function isTicketResolved(status: string): boolean {
  return TERMINAL_TICKET.has(status.toLowerCase());
}

export function buildDigestKpis(input: {
  slots: AttendanceSlotRow[];
  rondaStatuses: string[];
  incidentesTotal: number;
  incidentesResueltos: number;
  visitasCount: number;
}): DigestKpis {
  const att = aggregateAttendance(input.slots);
  const rondas = aggregateRondas(input.rondaStatuses);
  return {
    asistenciaPct: att.asistenciaPct,
    coberturaPct: att.coberturaPct,
    slotsCovered: att.covered,
    slotsTotal: att.total,
    rondasCompleted: rondas.completed,
    rondasTotal: rondas.total,
    rondasPct: rondas.pct,
    incidentesTotal: input.incidentesTotal,
    incidentesResueltos: input.incidentesResueltos,
    incidentesAbiertos: Math.max(
      0,
      input.incidentesTotal - input.incidentesResueltos
    ),
    visitasCount: input.visitasCount,
  };
}
