import { prisma } from "@/lib/prisma";
import { ymdInChile } from "@/lib/dates-cl";
import { cleanRut } from "@/lib/chile-rut";
import {
  DtReportFilters,
  mapTipoJornadaToArt25,
  matchesWorkerQuery,
  resolvedRange,
  turnoKey,
  utcRangeFromYmd,
} from "./filters";
import { fmtDdMmAa, fmtHms, fullName, minutesToHms, shiftRangeHms } from "./format";
import { isSundayOrHolidayYmd } from "./feriados-cl";
import {
  DT_SIGLAS_GLOSSARY,
  EMPTY_SELECTION_MESSAGE,
  NO_SHIFT_CHANGES_MESSAGE,
  NO_SUNDAY_HOLIDAY_MESSAGE,
} from "./constants";

export type DtReportRow = Record<string, string | number | boolean | null>;

export interface DtWorkerBlock {
  workerId: string;
  workerName: string;
  workerRut: string;
  installationName: string;
  cargo: string;
  header: Record<string, string>;
  rows: DtReportRow[];
  weeklyTotals?: DtReportRow[];
  emptyMessage?: string;
  modifiedRowIds?: string[];
}

export interface DtBuiltReport {
  tipo: string;
  title: string;
  employerName: string;
  employerRut: string;
  from: string;
  to: string;
  empty: boolean;
  emptyMessage: string;
  columns: { key: string; label: string }[];
  workers: DtWorkerBlock[];
  glossary: string;
}

function observationFromEvent(subtype: string | null | undefined, notes: string | null | undefined): string {
  const s = (subtype ?? "").toLowerCase();
  const parts: string[] = [];
  if (s.includes("vacacion")) parts.push("VAC");
  else if (s.includes("licencia")) parts.push("L.M.");
  else if (s.includes("prenatal")) parts.push("PREN.");
  else if (s.includes("postnatal")) parts.push("POSTN");
  else if (s.includes("permiso") && s.includes("sin")) parts.push("P.S.G.R.");
  else if (s.includes("permiso")) parts.push("P.G.R");
  if (notes) parts.push(notes);
  return parts.join(" · ");
}

function asistenciaSiNo(status: string, hasMark: boolean): "sí" | "no" {
  if (status === "asistio" || status === "reemplazo") return "sí";
  if (hasMark) return "sí";
  return "no";
}

export { resolvedRange };

export async function loadPortalUniverse(tenantId: string, filters: DtReportFilters) {
  const { from, to } = resolvedRange(filters);
  const { start, end } = utcRangeFromYmd(from, to);

  const [tenant, instalaciones, puestos, guardias, eventos, asignaciones] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, legalName: true, companyRut: true },
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId },
      select: { id: true, name: true, city: true, commune: true, address: true },
    }),
    prisma.opsPuestoOperativo.findMany({
      where: { tenantId, active: true },
      select: {
        id: true,
        name: true,
        shiftStart: true,
        shiftEnd: true,
        weekdays: true,
        installationId: true,
        cargo: { select: { name: true } },
      },
    }),
    prisma.opsGuardia.findMany({
      where: {
        tenantId,
        OR: [{ status: "active" }, { asistenciasPlanificadas: { some: { date: { gte: start, lte: end } } } }],
      },
      select: {
        id: true,
        tipoJornada: true,
        dtResolucionJornada: true,
        currentInstallationId: true,
        persona: { select: { firstName: true, lastName: true, rut: true, cargoStaff: true } },
      },
    }),
    prisma.opsGuardEvent.findMany({
      where: {
        tenantId,
        category: "ausencia",
        status: { in: ["approved", "pending"] },
        startDate: { lte: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
      },
      select: { guardiaId: true, subtype: true, startDate: true, endDate: true, reason: true },
    }),
    prisma.opsAsignacionGuardia.findMany({
      where: { tenantId, startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
      select: {
        guardiaId: true,
        puestoId: true,
        startDate: true,
        endDate: true,
        reason: true,
        createdBy: true,
        puesto: { select: { shiftStart: true, shiftEnd: true, weekdays: true, installationId: true } },
      },
      orderBy: { startDate: "asc" },
    }),
  ]);

  return { from, to, start, end, tenant, instalaciones, puestos, guardias, eventos, asignaciones };
}

type Universe = Awaited<ReturnType<typeof loadPortalUniverse>>;

function regionOf(inst: { city: string | null; commune: string | null }): string {
  return (inst.city || inst.commune || "Sin región").trim() || "Sin región";
}

export function filterGuardias(
  universe: Universe,
  filters: DtReportFilters,
): Universe["guardias"] {
  let list = universe.guardias;

  if (filters.workerIds && filters.workerIds.length > 0) {
    const set = new Set(filters.workerIds);
    list = list.filter((g) => set.has(g.id));
  }
  if (filters.workerQuery?.trim()) {
    list = list.filter((g) => matchesWorkerQuery(g.persona, filters.workerQuery!));
  }
  if (filters.jornada) {
    list = list.filter((g) => mapTipoJornadaToArt25(g.tipoJornada) === filters.jornada);
  }
  if (filters.installationIds && filters.installationIds.length > 0) {
    const set = new Set(filters.installationIds);
    const instByPuesto = new Map(universe.puestos.map((p) => [p.id, p.installationId]));
    const guardiasInInst = new Set<string>();
    for (const a of universe.asignaciones) {
      const instId = instByPuesto.get(a.puestoId) ?? a.puesto.installationId;
      if (instId && set.has(instId)) guardiasInInst.add(a.guardiaId);
    }
    list = list.filter((g) => (g.currentInstallationId && set.has(g.currentInstallationId)) || guardiasInInst.has(g.id));
  }
  if (filters.region) {
    const instIds = new Set(
      universe.instalaciones.filter((i) => regionOf(i) === filters.region).map((i) => i.id),
    );
    list = list.filter((g) => g.currentInstallationId && instIds.has(g.currentInstallationId));
  }
  if (filters.cargos && filters.cargos.length > 0) {
    const cargoSet = new Set(filters.cargos.map((c) => c.toLowerCase()));
    const cargoByPuesto = new Map(
      universe.puestos.map((p) => [p.id, (p.cargo?.name ?? "").toLowerCase()]),
    );
    const viaAsignacion = new Set<string>();
    for (const a of universe.asignaciones) {
      const c = cargoByPuesto.get(a.puestoId);
      if (c && cargoSet.has(c)) viaAsignacion.add(a.guardiaId);
    }
    list = list.filter((g) => {
      const staff = (g.persona.cargoStaff ?? "").toLowerCase();
      return (staff && cargoSet.has(staff)) || viaAsignacion.has(g.id);
    });
  }
  if (filters.turnos && filters.turnos.length > 0) {
    const turnoSet = new Set(filters.turnos);
    const matchPuestos = new Set(
      universe.puestos
        .filter((p) => turnoSet.has(turnoKey(p.shiftStart, p.shiftEnd, p.weekdays)))
        .map((p) => p.id),
    );
    const viaAsignacion = new Set(
      universe.asignaciones.filter((a) => matchPuestos.has(a.puestoId)).map((a) => a.guardiaId),
    );
    list = list.filter((g) => viaAsignacion.has(g.id));
  }

  return list;
}

export async function loadAsistenciaRows(
  tenantId: string,
  start: Date,
  end: Date,
  workerIds: string[],
) {
  if (workerIds.length === 0) return [];
  return prisma.opsAsistenciaDiaria.findMany({
    where: {
      tenantId,
      date: { gte: start, lte: end },
      OR: [
        { plannedGuardiaId: { in: workerIds } },
        { actualGuardiaId: { in: workerIds } },
      ],
    },
    select: {
      id: true,
      date: true,
      attendanceStatus: true,
      checkInAt: true,
      checkOutAt: true,
      plannedMinutes: true,
      workedMinutes: true,
      overtimeMinutes: true,
      lateMinutes: true,
      notes: true,
      isModified: true,
      deletedAt: true,
      plannedShiftStart: true,
      plannedShiftEnd: true,
      plannedGuardiaId: true,
      actualGuardiaId: true,
      earlyDepartureAt: true,
      installation: { select: { id: true, name: true } },
      puesto: {
        select: {
          name: true,
          shiftStart: true,
          shiftEnd: true,
          cargo: { select: { name: true } },
        },
      },
      marcacionEntrada: {
        select: {
          timestamp: true,
          isModified: true,
          deletedAt: true,
          atrasoMinutos: true,
          mandanteRut: true,
        },
      },
      marcacionSalida: {
        select: { timestamp: true, isModified: true, deletedAt: true },
      },
    },
    orderBy: [{ date: "asc" }],
  });
}

function eventsForDay(
  events: Universe["eventos"],
  guardiaId: string,
  dayYmd: string,
) {
  return events.filter((e) => {
    if (e.guardiaId !== guardiaId) return false;
    const start = e.startDate ? ymdInChile(e.startDate) : "";
    const end = e.endDate ? ymdInChile(e.endDate) : start;
    return start && dayYmd >= start && dayYmd <= end;
  });
}

function employerHeader(tenant: Universe["tenant"]) {
  return {
    employerName: tenant?.legalName || tenant?.name || "",
    employerRut: tenant?.companyRut || "",
  };
}

export async function buildReporteAsistencia(
  tenantId: string,
  filters: DtReportFilters,
): Promise<DtBuiltReport> {
  const universe = await loadPortalUniverse(tenantId, filters);
  const emp = employerHeader(universe.tenant);
  let workers = filterGuardias(universe, filters);

  if (filters.estRut) {
    const needle = cleanRut(filters.estRut);
    const rows = await prisma.opsMarcacion.findMany({
      where: {
        tenantId,
        timestamp: { gte: universe.start, lte: universe.end },
        mandanteRut: { not: null },
      },
      select: { guardiaId: true, mandanteRut: true },
    });
    const ids = new Set(
      rows.filter((r) => r.mandanteRut && cleanRut(r.mandanteRut).includes(needle)).map((r) => r.guardiaId),
    );
    workers = workers.filter((g) => ids.has(g.id));
  }

  const instById = new Map(universe.instalaciones.map((i) => [i.id, i]));
  const asistencia = await loadAsistenciaRows(
    tenantId,
    universe.start,
    universe.end,
    workers.map((w) => w.id),
  );

  const byWorker = new Map<string, typeof asistencia>();
  for (const row of asistencia) {
    const gid = row.actualGuardiaId || row.plannedGuardiaId;
    if (!gid) continue;
    const list = byWorker.get(gid) ?? [];
    list.push(row);
    byWorker.set(gid, list);
  }

  const columns = [
    { key: "fecha", label: "fecha" },
    { key: "asistencia", label: "Asistencia" },
    { key: "ausencia", label: "Ausencia" },
    { key: "observaciones", label: "Observaciones" },
  ];

  const blocks: DtWorkerBlock[] = [];
  const sorted = [...workers].sort((a, b) =>
    a.persona.lastName.localeCompare(b.persona.lastName, "es") ||
    a.persona.firstName.localeCompare(b.persona.firstName, "es"),
  );

  for (const w of sorted) {
    const rows = byWorker.get(w.id) ?? [];
    const inst = w.currentInstallationId ? instById.get(w.currentInstallationId) : undefined;
    const modifiedRowIds: string[] = [];
    const mapped: DtReportRow[] = rows.map((r) => {
      const day = r.date.toISOString().slice(0, 10);
      const hasMark = Boolean(r.marcacionEntrada || r.checkInAt);
      const si = asistenciaSiNo(r.attendanceStatus, hasMark);
      const ev = eventsForDay(universe.eventos, w.id, day);
      const justificada = si === "no" && ev.length > 0;
      const obs: string[] = [];
      if (ev.length) obs.push(observationFromEvent(ev[0]?.subtype, ev[0]?.reason));
      if (r.notes) obs.push(r.notes);
      if (r.marcacionEntrada?.isModified || r.marcacionSalida?.isModified || r.isModified) {
        obs.push("marca modificada");
        modifiedRowIds.push(r.id);
      }
      if (r.deletedAt || r.marcacionEntrada?.deletedAt || r.marcacionSalida?.deletedAt) {
        obs.push("marca eliminada");
        modifiedRowIds.push(r.id);
      }
      if (r.marcacionEntrada?.atrasoMinutos && r.marcacionEntrada.atrasoMinutos > 0) obs.push("AT");
      return {
        id: r.id,
        fecha: fmtDdMmAa(r.date),
        asistencia: si,
        ausencia: si === "no" ? (justificada ? "justificada" : "injustificada") : "",
        observaciones: obs.filter(Boolean).join(" · "),
      };
    });

    blocks.push({
      workerId: w.id,
      workerName: fullName(w.persona.firstName, w.persona.lastName),
      workerRut: w.persona.rut || "",
      installationName: inst?.name || rows[0]?.installation.name || "",
      cargo: w.persona.cargoStaff || rows[0]?.puesto.cargo?.name || "",
      header: {
        razonSocial: emp.employerName,
        rutEmpleador: emp.employerRut,
        trabajador: fullName(w.persona.firstName, w.persona.lastName),
        rutTrabajador: w.persona.rut || "",
        lugar: inst?.name || rows[0]?.installation.name || "",
      },
      rows: mapped,
      modifiedRowIds,
    });
  }

  const empty = blocks.length === 0;
  return {
    tipo: "asistencia",
    title: "Reporte de asistencia",
    employerName: emp.employerName,
    employerRut: emp.employerRut,
    from: universe.from,
    to: universe.to,
    empty,
    emptyMessage: empty ? EMPTY_SELECTION_MESSAGE : "",
    columns,
    workers: blocks,
    glossary: DT_SIGLAS_GLOSSARY,
  };
}

export async function buildReporteJornada(
  tenantId: string,
  filters: DtReportFilters,
): Promise<DtBuiltReport> {
  const universe = await loadPortalUniverse(tenantId, filters);
  const emp = employerHeader(universe.tenant);
  const workers = filterGuardias(universe, filters);
  const instById = new Map(universe.instalaciones.map((i) => [i.id, i]));
  const asistencia = await loadAsistenciaRows(
    tenantId,
    universe.start,
    universe.end,
    workers.map((w) => w.id),
  );
  const byWorker = new Map<string, typeof asistencia>();
  for (const row of asistencia) {
    const gid = row.actualGuardiaId || row.plannedGuardiaId;
    if (!gid) continue;
    const list = byWorker.get(gid) ?? [];
    list.push(row);
    byWorker.set(gid, list);
  }

  const columns = [
    { key: "fecha", label: "fecha" },
    { key: "jornadaOrdinaria", label: "Jornada ordinaria pactada" },
    { key: "marcacionesJornada", label: "Marcaciones jornada" },
    { key: "colacion", label: "Colación" },
    { key: "marcacionesColacion", label: "Marcaciones colación" },
    { key: "tiempoFaltante", label: "Tiempo faltante" },
    { key: "tiempoExtra", label: "Tiempo extra" },
    { key: "otrasMarcaciones", label: "Otras marcaciones" },
    { key: "observaciones", label: "Observaciones" },
    { key: "dej", label: "D.E.J." },
  ];

  const sorted = [...workers].sort((a, b) =>
    a.persona.lastName.localeCompare(b.persona.lastName, "es"),
  );
  const blocks: DtWorkerBlock[] = [];

  for (const w of sorted) {
    const rows = (byWorker.get(w.id) ?? []).slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    const inst = w.currentInstallationId ? instById.get(w.currentInstallationId) : undefined;
    const mapped: DtReportRow[] = [];
    const weekly: DtReportRow[] = [];
    let weekKey = "";
    let accFaltante = 0;
    let accExtra = 0;
    let accOrd = 0;
    const flushWeek = (label: string) => {
      weekly.push({
        etiqueta: label,
        tiempoFaltante: minutesToHms(accFaltante, accFaltante > 0 ? "-" : ""),
        tiempoExtra: minutesToHms(accExtra, accExtra > 0 ? "+" : ""),
        jornadaOrdinaria: minutesToHms(accOrd),
        compensacion:
          accExtra - accFaltante >= 0
            ? minutesToHms(accExtra - accFaltante, "+")
            : minutesToHms(accFaltante - accExtra, "-"),
      });
      accFaltante = 0;
      accExtra = 0;
      accOrd = 0;
    };

    for (const r of rows) {
      const isoKey = weekStartKey(r.date);
      if (weekKey && isoKey !== weekKey) flushWeek(`Total semana ${weekKey}`);
      weekKey = isoKey;

      const jornada = shiftRangeHms(r.plannedShiftStart || r.puesto.shiftStart, r.plannedShiftEnd || r.puesto.shiftEnd);
      const marcas = [fmtHms(r.marcacionEntrada?.timestamp ?? r.checkInAt), fmtHms(r.marcacionSalida?.timestamp ?? r.checkOutAt)]
        .filter(Boolean)
        .join(" - ");
      const faltante = (r.lateMinutes || 0) + (r.earlyDepartureAt ? 0 : 0);
      const extra = r.overtimeMinutes || 0;
      accFaltante += faltante;
      accExtra += extra;
      accOrd += r.plannedMinutes || 0;

      const obs: string[] = [];
      if (r.notes) obs.push(r.notes);
      if (r.marcacionEntrada?.isModified || r.isModified) obs.push("marca modificada");
      if (extra > 0) obs.push("H.E.");

      mapped.push({
        id: r.id,
        fecha: fmtDdMmAa(r.date),
        jornadaOrdinaria: jornada,
        marcacionesJornada: marcas,
        colacion: "No aplica",
        marcacionesColacion: "No aplica",
        tiempoFaltante: faltante > 0 ? minutesToHms(faltante, "-") : minutesToHms(0),
        tiempoExtra: extra > 0 ? minutesToHms(extra, "+") : minutesToHms(0, "+"),
        otrasMarcaciones: "",
        observaciones: obs.join(" · "),
        dej: w.dtResolucionJornada || "",
      });
    }
    if (weekKey) flushWeek(`Total semana ${weekKey}`);

    blocks.push({
      workerId: w.id,
      workerName: fullName(w.persona.firstName, w.persona.lastName),
      workerRut: w.persona.rut || "",
      installationName: inst?.name || rows[0]?.installation.name || "",
      cargo: w.persona.cargoStaff || "",
      header: {
        razonSocial: emp.employerName,
        rutEmpleador: emp.employerRut,
        trabajador: fullName(w.persona.firstName, w.persona.lastName),
        rutTrabajador: w.persona.rut || "",
        lugar: inst?.name || rows[0]?.installation.name || "",
        bandaHoraria: "No",
        dej: w.dtResolucionJornada || "",
      },
      rows: mapped,
      weeklyTotals: weekly,
    });
  }

  const empty = blocks.length === 0;
  return {
    tipo: "jornada-diaria",
    title: "Reporte de jornada diaria",
    employerName: emp.employerName,
    employerRut: emp.employerRut,
    from: universe.from,
    to: universe.to,
    empty,
    emptyMessage: empty ? EMPTY_SELECTION_MESSAGE : "",
    columns,
    workers: blocks,
    glossary: DT_SIGLAS_GLOSSARY,
  };
}

function weekStartKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

export async function buildReporteDomingos(
  tenantId: string,
  filters: DtReportFilters,
): Promise<DtBuiltReport> {
  const universe = await loadPortalUniverse(tenantId, filters);
  const emp = employerHeader(universe.tenant);
  const workers = filterGuardias(universe, filters);
  const instById = new Map(universe.instalaciones.map((i) => [i.id, i]));
  const asistencia = await loadAsistenciaRows(
    tenantId,
    universe.start,
    universe.end,
    workers.map((w) => w.id),
  );

  const columns = [
    { key: "comercioDominical", label: "Descanso dominical adicional (comercio)" },
    { key: "fecha", label: "fecha" },
    { key: "asistencia", label: "Asistencia" },
    { key: "ausencia", label: "Ausencia" },
    { key: "observaciones", label: "Observaciones" },
  ];

  const sorted = [...workers].sort((a, b) =>
    a.persona.lastName.localeCompare(b.persona.lastName, "es"),
  );
  const blocks: DtWorkerBlock[] = [];

  for (const w of sorted) {
    const rows = asistencia.filter((r) => (r.actualGuardiaId || r.plannedGuardiaId) === w.id);
    const holidayRows = rows.filter((r) => isSundayOrHolidayYmd(r.date.toISOString().slice(0, 10)));
    const inst = w.currentInstallationId ? instById.get(w.currentInstallationId) : undefined;

    if (holidayRows.length === 0) {
      blocks.push({
        workerId: w.id,
        workerName: fullName(w.persona.firstName, w.persona.lastName),
        workerRut: w.persona.rut || "",
        installationName: inst?.name || "",
        cargo: w.persona.cargoStaff || "",
        header: {
          razonSocial: emp.employerName,
          rutEmpleador: emp.employerRut,
          trabajador: fullName(w.persona.firstName, w.persona.lastName),
          rutTrabajador: w.persona.rut || "",
          lugar: inst?.name || "",
          cargo: w.persona.cargoStaff || "",
        },
        rows: [],
        emptyMessage: NO_SUNDAY_HOLIDAY_MESSAGE,
      });
      continue;
    }

    const mapped: DtReportRow[] = holidayRows.map((r) => {
      const day = r.date.toISOString().slice(0, 10);
      const hasMark = Boolean(r.marcacionEntrada || r.checkInAt);
      const si = asistenciaSiNo(r.attendanceStatus, hasMark);
      const ev = eventsForDay(universe.eventos, w.id, day);
      const justificada = si === "no" && ev.length > 0;
      return {
        id: r.id,
        comercioDominical: "no",
        fecha: fmtDdMmAa(r.date),
        asistencia: si,
        ausencia: si === "no" ? (justificada ? "justificada" : "injustificada") : "",
        observaciones: [
          ...ev.map((e) => observationFromEvent(e.subtype, e.reason)),
          r.notes ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
        ymd: day,
      };
    });

    const byMonth = new Map<string, number>();
    for (const r of mapped) {
      if (r.asistencia === "sí") {
        const ymd = String(r.ymd);
        const month = ymd.slice(0, 7);
        byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
      }
    }
    const weeklyTotals: DtReportRow[] = [
      ...[...byMonth.entries()].map(([month, n]) => ({
        etiqueta: `Total ${month}`,
        asistencia: String(n),
      })),
      {
        etiqueta: "Total periodo",
        asistencia: String([...byMonth.values()].reduce((a, b) => a + b, 0)),
      },
    ];

    blocks.push({
      workerId: w.id,
      workerName: fullName(w.persona.firstName, w.persona.lastName),
      workerRut: w.persona.rut || "",
      installationName: inst?.name || "",
      cargo: w.persona.cargoStaff || "",
      header: {
        razonSocial: emp.employerName,
        rutEmpleador: emp.employerRut,
        trabajador: fullName(w.persona.firstName, w.persona.lastName),
        rutTrabajador: w.persona.rut || "",
        lugar: inst?.name || "",
        cargo: w.persona.cargoStaff || "",
      },
      rows: mapped,
      weeklyTotals,
    });
  }

  const empty = workers.length === 0;
  return {
    tipo: "domingos-festivos",
    title: "Reporte de días domingo y/o días festivos",
    employerName: emp.employerName,
    employerRut: emp.employerRut,
    from: universe.from,
    to: universe.to,
    empty,
    emptyMessage: empty ? EMPTY_SELECTION_MESSAGE : "",
    columns,
    workers: blocks,
    glossary: DT_SIGLAS_GLOSSARY,
  };
}

function turnoExtension(weekdays: string[]): string {
  if (weekdays.length === 0 || weekdays.length === 7) return "semanal";
  if (weekdays.length === 1) return "diario";
  if (weekdays.length === 10 || weekdays.length === 12) return "bisemanal";
  return "semanal";
}

export async function buildReporteModificacionesTurnos(
  tenantId: string,
  filters: DtReportFilters,
): Promise<DtBuiltReport> {
  const universe = await loadPortalUniverse(tenantId, filters);
  const emp = employerHeader(universe.tenant);
  const workers = filterGuardias(universe, filters);
  const instById = new Map(universe.instalaciones.map((i) => [i.id, i]));

  const allAsign = await prisma.opsAsignacionGuardia.findMany({
    where: { tenantId, guardiaId: { in: workers.map((w) => w.id) } },
    select: {
      guardiaId: true,
      puestoId: true,
      startDate: true,
      endDate: true,
      reason: true,
      createdBy: true,
      createdAt: true,
      puesto: { select: { shiftStart: true, shiftEnd: true, weekdays: true, installationId: true } },
    },
    orderBy: { startDate: "asc" },
  });

  const columns = [
    { key: "fechaAsignacion", label: "Fecha asignación turno" },
    { key: "turnoAsignado", label: "Turno asignado" },
    { key: "extension", label: "Extensión" },
    { key: "fechaAsignacionNuevo", label: "Fecha asignación nuevo turno" },
    { key: "inicioNuevo", label: "Inicio de turno" },
    { key: "nuevoTurno", label: "Nuevo turno asignado" },
    { key: "extensionNuevo", label: "Extensión nuevo turno" },
    { key: "solicitante", label: "Quién solicitó el cambio" },
    { key: "observaciones", label: "Observaciones" },
  ];

  const sorted = [...workers].sort((a, b) =>
    a.persona.lastName.localeCompare(b.persona.lastName, "es"),
  );
  const blocks: DtWorkerBlock[] = [];

  for (const w of sorted) {
    const inst = w.currentInstallationId ? instById.get(w.currentInstallationId) : undefined;
    const asigns = allAsign.filter((a) => a.guardiaId === w.id);
    const changes: DtReportRow[] = [];
    for (let i = 1; i < asigns.length; i++) {
      const prev = asigns[i - 1]!;
      const next = asigns[i]!;
      const prevKey = `${prev.puesto.shiftStart}-${prev.puesto.shiftEnd}`;
      const nextKey = `${next.puesto.shiftStart}-${next.puesto.shiftEnd}`;
      if (prevKey === nextKey && prev.puestoId === next.puestoId) continue;
      const nextStart = next.startDate.toISOString().slice(0, 10);
      if (nextStart < universe.from || nextStart > universe.to) continue;
      const reason = (next.reason ?? "").toLowerCase();
      const solicitante = reason.includes("trabajador") || reason.includes("solicitud")
        ? "Trabajador"
        : "Empleador";
      changes.push({
        fechaAsignacion: fmtDdMmAa(prev.startDate),
        turnoAsignado: `${prev.puesto.shiftStart} a ${prev.puesto.shiftEnd}`,
        extension: turnoExtension(prev.puesto.weekdays),
        fechaAsignacionNuevo: fmtDdMmAa(next.createdAt),
        inicioNuevo: fmtDdMmAa(next.startDate),
        nuevoTurno: `${next.puesto.shiftStart} a ${next.puesto.shiftEnd}`,
        extensionNuevo: turnoExtension(next.puesto.weekdays),
        solicitante,
        observaciones: next.reason || "",
      });
    }

    blocks.push({
      workerId: w.id,
      workerName: fullName(w.persona.firstName, w.persona.lastName),
      workerRut: w.persona.rut || "",
      installationName: inst?.name || "",
      cargo: w.persona.cargoStaff || "",
      header: {
        razonSocial: emp.employerName,
        rutEmpleador: emp.employerRut,
        trabajador: fullName(w.persona.firstName, w.persona.lastName),
        rutTrabajador: w.persona.rut || "",
        lugar: inst?.name || "",
      },
      rows: changes,
      emptyMessage: changes.length === 0 ? NO_SHIFT_CHANGES_MESSAGE : undefined,
    });
  }

  const empty = workers.length === 0;
  return {
    tipo: "modificaciones-turnos",
    title: "Reporte de modificaciones y/o alteraciones de turnos",
    employerName: emp.employerName,
    employerRut: emp.employerRut,
    from: universe.from,
    to: universe.to,
    empty,
    emptyMessage: empty ? EMPTY_SELECTION_MESSAGE : "",
    columns,
    workers: blocks,
    glossary: DT_SIGLAS_GLOSSARY,
  };
}

export async function buildReporteDiario(
  tenantId: string,
  filters: DtReportFilters,
): Promise<DtBuiltReport> {
  const day = filters.from || filters.to;
  const scoped: DtReportFilters = { ...filters, from: day, to: day, periodo: null };
  const asistencia = await buildReporteAsistencia(tenantId, scoped);
  return {
    ...asistencia,
    tipo: "reporte-diario",
    title: "Reporte diario",
  };
}

export async function buildDtReport(
  tenantId: string,
  tipo: string,
  filters: DtReportFilters,
): Promise<DtBuiltReport> {
  switch (tipo) {
    case "jornada-diaria":
      return buildReporteJornada(tenantId, filters);
    case "domingos-festivos":
      return buildReporteDomingos(tenantId, filters);
    case "modificaciones-turnos":
      return buildReporteModificacionesTurnos(tenantId, filters);
    case "reporte-diario":
      return buildReporteDiario(tenantId, filters);
    case "asistencia":
    default:
      return buildReporteAsistencia(tenantId, filters);
  }
}
