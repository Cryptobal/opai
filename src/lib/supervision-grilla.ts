/**
 * Grilla de supervisión (instalación × día): turno, duración, calidad e
 * incidentes derivados del modelo real. Sin campos nuevos de backend.
 */

import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { CHILE_TZ } from "@/lib/dates-cl";

export const SHORT_VISIT_MINUTES = 20;
export const SHIFT_STORAGE_KEY = "opai-supervision-grilla-turno";

export type SupervisionShift = "day" | "night";
export type ShiftFilter = "day" | "night" | "both";
export type ChipKind = "empty" | "day" | "night" | "multi" | "mixed";
export type EmptyKind = "none" | "idle" | "missed" | "future";
export type QualityKind = "ok" | "short" | "no_checkout" | "geofence";
export type KpiFilter = "none" | "por_validar" | "sin_noche" | "calidad" | "incidentes";
export type GrillaSortMode = "az" | "vis_desc" | "vis_asc" | "hrs" | "inc" | "cobertura";

export type GrillaVisit = {
  id: string;
  installationId: string;
  day: number;
  supervisorName: string;
  initials: string;
  checkInAt: string;
  checkOutAt: string | null;
  durationMinutes: number | null;
  durationLabel: string;
  shift: SupervisionShift;
  crossedShift: boolean;
  shortVisit: boolean;
  noCheckout: boolean;
  outsideGeofence: boolean;
  status: string;
  findingCount: number;
};

export type GrillaIncident = {
  id: string;
  installationId: string;
  day: number;
  shift: SupervisionShift;
  status: string;
  title: string;
  code: string;
};

export type GrillaAssignmentWindow = {
  start: string;
  end: string | null;
};

export type GrillaInstallation = {
  id: string;
  name: string;
  openFindings: number;
  nocturnoEnabled: boolean;
  assignmentWindows: GrillaAssignmentWindow[];
};

export type ChileYmd = { year: number; month: number; day: number };

export type GrillaPayload = {
  year: number;
  month: number;
  daysInMonth: number;
  today: ChileYmd;
  installations: GrillaInstallation[];
  visits: GrillaVisit[];
  incidents: GrillaIncident[];
};

export type GrillaCellView = {
  day: number;
  visits: GrillaVisit[];
  incidents: GrillaIncident[];
  openIncidents: GrillaIncident[];
  pendingValidation: GrillaIncident[];
  chip: ChipKind;
  empty: EmptyKind;
  initials: string;
  count: number;
  hasIncident: boolean;
  quality: QualityKind;
  crossedShift: boolean;
};

export type GrillaRowView = {
  installation: GrillaInstallation;
  totalVisits: number;
  hoursOnSite: number;
  hoursLabel: string;
  openIncidents: number;
  pendingValidation: number;
  missingNight: boolean;
  unexecuted: boolean;
  qualityVisitCount: number;
  cells: Record<number, GrillaCellView>;
};

export type GrillaKpis = {
  porValidar: number;
  sinNoche: number;
  calidad: number;
  conIncidentes: number;
};

export type GrillaView = {
  rows: GrillaRowView[];
  kpis: GrillaKpis;
};

export function chileParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const z = toZonedTime(date, CHILE_TZ);
  return {
    year: z.getFullYear(),
    month: z.getMonth() + 1,
    day: z.getDate(),
    hour: z.getHours(),
    minute: z.getMinutes(),
  };
}

export function monthRangeChile(year: number, month: number): {
  start: Date;
  end: Date;
  daysInMonth: number;
} {
  const daysInMonth = new Date(year, month, 0).getDate();
  const start = fromZonedTime(new Date(year, month - 1, 1, 0, 0, 0, 0), CHILE_TZ);
  const end = fromZonedTime(new Date(year, month - 1, daysInMonth, 23, 59, 59, 999), CHILE_TZ);
  return { start, end, daysInMonth };
}

export function dayRangeChile(year: number, month: number, day: number): {
  start: Date;
  end: Date;
} {
  return {
    start: fromZonedTime(new Date(year, month - 1, day, 0, 0, 0, 0), CHILE_TZ),
    end: fromZonedTime(new Date(year, month - 1, day, 23, 59, 59, 999), CHILE_TZ),
  };
}

/** Día = 06:00–19:59; noche = 20:00–05:59. Según hora de inicio en Chile. */
export function shiftFromHour(hour: number): SupervisionShift {
  return hour >= 6 && hour <= 19 ? "day" : "night";
}

export function shiftFromStart(date: Date): SupervisionShift {
  return shiftFromHour(chileParts(date).hour);
}

export function visitMatchesShift(shift: SupervisionShift, filter: ShiftFilter): boolean {
  return filter === "both" || shift === filter;
}

export function deriveDurationMinutes(
  checkInAt: Date,
  checkOutAt: Date | null,
): number | null {
  if (!checkOutAt) return null;
  return Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000));
}

export function formatDurationLabel(minutes: number | null): string {
  if (minutes == null) return "Sin salida";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function formatHoursLabel(minutes: number): string {
  if (minutes <= 0) return "0";
  const hours = minutes / 60;
  return hours.toLocaleString("es-CL", {
    minimumFractionDigits: hours % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

export function formatChileTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", {
    timeZone: CHILE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function crossesShift(checkInAt: Date, checkOutAt: Date | null): boolean {
  if (!checkOutAt) return false;
  return shiftFromStart(checkInAt) !== shiftFromStart(checkOutAt);
}

/** Fuera de geocerca solo si el check-in se evaluó contra el recinto. */
export function isOutsideGeofence(
  checkInGeoValidada: boolean,
  checkInDistanciaM: number | null | undefined,
): boolean {
  return checkInDistanciaM != null && !checkInGeoValidada;
}

export function qualityFromFlags(opts: {
  shortVisit: boolean;
  noCheckout: boolean;
  outsideGeofence: boolean;
}): QualityKind {
  if (opts.outsideGeofence) return "geofence";
  if (opts.noCheckout) return "no_checkout";
  if (opts.shortVisit) return "short";
  return "ok";
}

export function chipKind(visits: Array<{ shift: SupervisionShift }>): ChipKind {
  if (visits.length === 0) return "empty";
  const hasDay = visits.some((v) => v.shift === "day");
  const hasNight = visits.some((v) => v.shift === "night");
  if (hasDay && hasNight) return "mixed";
  if (visits.length === 1) return hasNight ? "night" : "day";
  return "multi";
}

export function ymdKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function compareYmd(a: ChileYmd, b: ChileYmd): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function assignmentCoversDay(
  windows: GrillaAssignmentWindow[],
  year: number, month: number, day: number,
): boolean {
  const ymd = ymdKey(year, month, day);
  return windows.some((w) => ymd >= w.start && (w.end == null || ymd <= w.end));
}

export function emptyKind(opts: {
  hasVisit: boolean;
  assigned: boolean;
  unexecutedRow: boolean;
  cell: ChileYmd;
  today: ChileYmd;
}): EmptyKind {
  if (opts.hasVisit) return "none";
  const vsToday = compareYmd(opts.cell, opts.today);
  if (vsToday > 0) return "future";
  if (!opts.assigned) return "none";
  if (opts.unexecutedRow) return "missed";
  return "idle";
}

export type RawGrillaVisit = {
  id: string;
  installationId: string;
  checkInAt: Date;
  checkOutAt: Date | null;
  checkInGeoValidada: boolean;
  checkInDistanciaM: number | null;
  status: string;
  supervisorName: string | null;
  findingCount: number;
};

export type RawGrillaIncident = {
  id: string;
  installationId: string | null;
  createdAt: Date;
  status: string;
  title: string;
  code: string;
};

export function mapVisit(raw: RawGrillaVisit, year: number, month: number): GrillaVisit | null {
  const parts = chileParts(raw.checkInAt);
  if (parts.year !== year || parts.month !== month) return null;
  const durationMinutes = deriveDurationMinutes(raw.checkInAt, raw.checkOutAt);
  const noCheckout = raw.checkOutAt == null;
  const name = raw.supervisorName?.trim() || "Supervisor";
  return {
    id: raw.id,
    installationId: raw.installationId,
    day: parts.day,
    supervisorName: name,
    initials: getInitials(name),
    checkInAt: raw.checkInAt.toISOString(),
    checkOutAt: raw.checkOutAt?.toISOString() ?? null,
    durationMinutes,
    durationLabel: formatDurationLabel(durationMinutes),
    shift: shiftFromHour(parts.hour),
    crossedShift: crossesShift(raw.checkInAt, raw.checkOutAt),
    shortVisit: durationMinutes != null && durationMinutes < SHORT_VISIT_MINUTES,
    noCheckout,
    outsideGeofence: isOutsideGeofence(raw.checkInGeoValidada, raw.checkInDistanciaM),
    status: raw.status,
    findingCount: raw.findingCount,
  };
}

export function mapIncident(raw: RawGrillaIncident, year: number, month: number): GrillaIncident | null {
  if (!raw.installationId) return null;
  const parts = chileParts(raw.createdAt);
  if (parts.year !== year || parts.month !== month) return null;
  return {
    id: raw.id,
    installationId: raw.installationId,
    day: parts.day,
    shift: shiftFromHour(parts.hour),
    status: raw.status,
    title: raw.title,
    code: raw.code,
  };
}

export function isOpenIncident(status: string): boolean {
  return status === "open" || status === "in_progress";
}

export function isPendingValidation(status: string): boolean {
  return status === "resolved";
}

function cellQuality(visits: GrillaVisit[]): QualityKind {
  let worst: QualityKind = "ok";
  for (const v of visits) {
    const q = qualityFromFlags(v);
    if (q === "geofence") return "geofence";
    if (q === "no_checkout") worst = "no_checkout";
    else if (q === "short" && worst === "ok") worst = "short";
  }
  return worst;
}

export function buildGrillaView(
  data: GrillaPayload,
  shift: ShiftFilter,
  kpiFilter: KpiFilter = "none",
): GrillaView {
  const visitsByInst = new Map<string, GrillaVisit[]>();
  const incidentsByInst = new Map<string, GrillaIncident[]>();

  for (const v of data.visits) {
    if (!visitMatchesShift(v.shift, shift)) continue;
    const list = visitsByInst.get(v.installationId) ?? [];
    list.push(v);
    visitsByInst.set(v.installationId, list);
  }
  for (const inc of data.incidents) {
    if (!visitMatchesShift(inc.shift, shift)) continue;
    const list = incidentsByInst.get(inc.installationId) ?? [];
    list.push(inc);
    incidentsByInst.set(inc.installationId, list);
  }

  const rows: GrillaRowView[] = data.installations.map((installation) => {
    const visits = visitsByInst.get(installation.id) ?? [];
    const incidents = incidentsByInst.get(installation.id) ?? [];
    const nightVisitsAll = data.visits.filter(
      (v) => v.installationId === installation.id && v.shift === "night",
    );
    const missingNight = installation.nocturnoEnabled && nightVisitsAll.length === 0;
    const unexecuted = visits.length === 0;

    const cells: Record<number, GrillaCellView> = {};
    for (let day = 1; day <= data.daysInMonth; day++) {
      const dayVisits = visits.filter((v) => v.day === day);
      const dayIncidents = incidents.filter((i) => i.day === day);
      const assigned = assignmentCoversDay(
        installation.assignmentWindows,
        data.year,
        data.month,
        day,
      );
      cells[day] = {
        day,
        visits: dayVisits,
        incidents: dayIncidents,
        openIncidents: dayIncidents.filter((i) => isOpenIncident(i.status)),
        pendingValidation: dayIncidents.filter((i) => isPendingValidation(i.status)),
        chip: chipKind(dayVisits),
        empty: emptyKind({
          hasVisit: dayVisits.length > 0,
          assigned,
          unexecutedRow: unexecuted,
          cell: { year: data.year, month: data.month, day },
          today: data.today,
        }),
        initials: dayVisits.length === 1 ? dayVisits[0].initials : "",
        count: dayVisits.length,
        hasIncident: dayIncidents.length > 0,
        quality: cellQuality(dayVisits),
        crossedShift: dayVisits.some((v) => v.crossedShift),
      };
    }

    const minutesOnSite = visits.reduce(
      (sum, v) => sum + (v.durationMinutes ?? 0),
      0,
    );

    return {
      installation,
      totalVisits: visits.length,
      hoursOnSite: minutesOnSite / 60,
      hoursLabel: formatHoursLabel(minutesOnSite),
      openIncidents: incidents.filter((i) => isOpenIncident(i.status)).length,
      pendingValidation: incidents.filter((i) => isPendingValidation(i.status)).length,
      missingNight,
      unexecuted,
      qualityVisitCount: visits.filter(
        (v) => v.shortVisit || v.noCheckout || v.outsideGeofence,
      ).length,
      cells,
    };
  });

  const kpis: GrillaKpis = {
    porValidar: rows.reduce((s, r) => s + r.pendingValidation, 0),
    sinNoche: rows.filter((r) => r.missingNight).length,
    calidad: rows.reduce((s, r) => s + r.qualityVisitCount, 0),
    conIncidentes: rows.filter((r) => r.openIncidents > 0).length,
  };

  const filtered = rows.filter((row) => {
    if (kpiFilter === "por_validar") return row.pendingValidation > 0;
    if (kpiFilter === "sin_noche") return row.missingNight;
    if (kpiFilter === "calidad") return row.qualityVisitCount > 0;
    if (kpiFilter === "incidentes") return row.openIncidents > 0;
    return true;
  });

  return { rows: filtered, kpis };
}

export function sortGrillaRows(rows: GrillaRowView[], mode: GrillaSortMode): GrillaRowView[] {
  const list = [...rows];
  const byName = (a: GrillaRowView, b: GrillaRowView) =>
    a.installation.name.localeCompare(b.installation.name, "es");
  switch (mode) {
    case "vis_desc":
      return list.sort((a, b) => b.totalVisits - a.totalVisits || byName(a, b));
    case "vis_asc":
      return list.sort((a, b) => a.totalVisits - b.totalVisits || byName(a, b));
    case "hrs":
      return list.sort((a, b) => b.hoursOnSite - a.hoursOnSite || byName(a, b));
    case "inc":
      return list.sort((a, b) => b.openIncidents - a.openIncidents || byName(a, b));
    case "cobertura":
      return list.sort((a, b) => {
        if (a.missingNight !== b.missingNight) return a.missingNight ? -1 : 1;
        if (a.unexecuted !== b.unexecuted) return a.unexecuted ? -1 : 1;
        if (a.qualityVisitCount !== b.qualityVisitCount) {
          return b.qualityVisitCount - a.qualityVisitCount;
        }
        if (a.hoursOnSite !== b.hoursOnSite) return a.hoursOnSite - b.hoursOnSite;
        return byName(a, b);
      });
    default:
      return list.sort(byName);
  }
}

export function parseShiftFilter(value: string | null | undefined): ShiftFilter {
  if (value === "day" || value === "night" || value === "both") return value;
  return "both";
}
