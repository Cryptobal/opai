import { addDaysChile, startOfDayChile, todayInChile, ymdInChile } from "@/lib/dates-cl";
import { cleanRut, toSiiRut } from "@/lib/chile-rut";

export type DtPeriodoPredefinido =
  | "ultima_semana"
  | "ultima_quincena"
  | "mes_anterior"
  | "12_meses";

export interface DtReportFilters {
  from: string;
  to: string;
  periodo?: DtPeriodoPredefinido | null;
  workerQuery?: string | null;
  workerIds?: string[];
  jornada?: string | null;
  turnos?: string[];
  region?: string | null;
  installationIds?: string[];
  cargos?: string[];
  estRut?: string | null;
}

export function parseCsvParam(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolvePeriodRange(
  periodo: DtPeriodoPredefinido | null | undefined,
  now: Date = new Date(),
): { from: string; to: string } | null {
  const today = todayInChile(now);
  const [ty, tm, td] = today.split("-").map(Number);
  const todayUtc = new Date(Date.UTC(ty, tm - 1, td));

  if (periodo === "ultima_semana") {
    const from = ymdInChile(addDaysChile(todayUtc, -6));
    return { from, to: today };
  }
  if (periodo === "ultima_quincena") {
    const from = ymdInChile(addDaysChile(todayUtc, -14));
    return { from, to: today };
  }
  if (periodo === "mes_anterior") {
    const firstThisMonth = new Date(Date.UTC(ty, tm - 1, 1));
    const lastPrev = new Date(firstThisMonth.getTime() - 24 * 60 * 60 * 1000);
    const py = lastPrev.getUTCFullYear();
    const pm = lastPrev.getUTCMonth();
    const from = `${py}-${String(pm + 1).padStart(2, "0")}-01`;
    const to = lastPrev.toISOString().slice(0, 10);
    return { from, to };
  }
  if (periodo === "12_meses") {
    const fromDate = new Date(Date.UTC(ty - 1, tm - 1, td));
    return { from: fromDate.toISOString().slice(0, 10), to: today };
  }
  return null;
}

/** Prioriza from/to explícitos para que los filtros Art. 25 se combinan en cualquier orden. */
export function resolvedRange(filters: DtReportFilters, now = new Date()): { from: string; to: string } {
  if (filters.from && filters.to) return { from: filters.from, to: filters.to };
  const preset = resolvePeriodRange(filters.periodo, now);
  if (preset) return preset;
  return { from: filters.from, to: filters.to };
}

export function utcRangeFromYmd(from: string, to: string): { start: Date; end: Date } {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return {
    start: new Date(Date.UTC(fy, fm - 1, fd)),
    end: new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59)),
  };
}

/** Art. 25.1 a: nombre y/o primer apellido, o RUT sin puntos con guión. */
export function matchesWorkerQuery(
  persona: { firstName: string; lastName: string; rut: string | null },
  raw: string,
): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const full = `${persona.firstName} ${persona.lastName}`.toLowerCase();
  if (full.includes(q) || persona.firstName.toLowerCase().includes(q) || persona.lastName.toLowerCase().includes(q)) {
    return true;
  }
  if (!persona.rut) return false;
  const qClean = cleanRut(q);
  if (qClean.length < 2) return false;
  const personaClean = cleanRut(persona.rut);
  if (personaClean.includes(qClean)) return true;
  const withHyphen = toSiiRut(q);
  return persona.rut.replace(/\./g, "").toLowerCase() === withHyphen.toLowerCase();
}

export function mapTipoJornadaToArt25(tipoJornada: string | null | undefined): string {
  const t = (tipoJornada ?? "").toLowerCase();
  if (t === "excepcional") return "excepcional";
  if (t === "parcial") return "parcial";
  if (t === "bisemanal") return "bisemanal";
  if (t === "ciclos" || t === "ciclo") return "ciclos";
  if (t === "turnos" || t === "por_turnos") return "turnos";
  return "fija";
}

export function turnoKey(shiftStart: string, shiftEnd: string, weekdays?: string[]): string {
  const hours = `${shiftStart} a ${shiftEnd}`;
  if (weekdays && weekdays.length > 0 && weekdays.length < 7) {
    return `${weekdays.join("-")} ${hours}`;
  }
  return hours;
}

export { startOfDayChile };

export function parseDtFilters(sp: URLSearchParams): DtReportFilters {
  const rawPeriodo = sp.get("periodo");
  const periodo =
    rawPeriodo === "ultima_semana" ||
    rawPeriodo === "ultima_quincena" ||
    rawPeriodo === "mes_anterior" ||
    rawPeriodo === "12_meses"
      ? rawPeriodo
      : null;
  let from = (sp.get("from") ?? "").trim();
  let to = (sp.get("to") ?? "").trim();
  if (!from || !to) {
    const fallback = resolvePeriodRange(periodo ?? "ultima_semana");
    if (fallback) {
      from = from || fallback.from;
      to = to || fallback.to;
    }
  }
  return {
    from,
    to,
    periodo,
    workerQuery: sp.get("q") || sp.get("trabajador") || null,
    workerIds: parseCsvParam(sp.get("workerIds")),
    jornada: sp.get("jornada"),
    turnos: parseCsvParam(sp.get("turnos")),
    region: sp.get("region"),
    installationIds: parseCsvParam(sp.get("installationIds") ?? sp.get("instalaciones")),
    cargos: parseCsvParam(sp.get("cargos")),
    estRut: sp.get("est") || sp.get("estRut"),
  };
}
