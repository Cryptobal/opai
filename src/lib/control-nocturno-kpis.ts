import { prisma } from "@/lib/prisma";

export type InstallationKpi = {
  installationId: string | null;
  installationName: string;
  totalRondas: number;
  completadas: number;
  omitidas: number;
  cumplimiento: number;
  avgDesvMin: number;
  reportCount: number;
  novedades: number;
  criticos: number;
  alert: boolean;
};

export type WeeklyTrend = {
  weekLabel: string;
  weekStart: string;
  cumplimiento: number;
  totalRondas: number;
  completadas: number;
};

export type KpiGlobal = {
  totalRondas: number;
  completadas: number;
  omitidas: number;
  cumplimiento: number;
  alertCount: number;
  criticalCount: number;
  avgDesvMin: number;
};

export type KpiAggregate = {
  period: { from: string; to: string; reportCount: number };
  global: KpiGlobal;
  installations: InstallationKpi[];
  weeklyTrend: WeeklyTrend[];
  topRisks: InstallationKpi[];
  topBest: InstallationKpi[];
};

export type PeriodComparison = {
  current: KpiGlobal;
  previous: KpiGlobal;
  deltaCumplimiento: number;
  deltaOmitidas: number;
  deltaAlertCount: number;
};

type Snapshot = {
  week: PeriodComparison;
  mtd: PeriodComparison;
  ytd: PeriodComparison;
};

const FINAL_STATUSES = ["aprobado", "enviado"] as const;
const ALERT_THRESHOLD = 80;

type RawReport = {
  id: string;
  date: Date;
  instalaciones: Array<{
    installationId: string | null;
    installationName: string;
    statusInstalacion: string;
    rondas: Array<{
      status: string;
      horaEsperada: string;
      horaMarcada: string | null;
    }>;
  }>;
};

async function fetchReports(
  tenantId: string,
  dateFrom: Date,
  dateTo: Date,
): Promise<RawReport[]> {
  return prisma.opsControlNocturno.findMany({
    where: {
      tenantId,
      status: { in: FINAL_STATUSES as unknown as string[] },
      date: { gte: dateFrom, lte: dateTo },
    },
    select: {
      id: true,
      date: true,
      instalaciones: {
        select: {
          installationId: true,
          installationName: true,
          statusInstalacion: true,
          rondas: {
            select: {
              status: true,
              horaEsperada: true,
              horaMarcada: true,
            },
          },
        },
      },
    },
    orderBy: { date: "asc" },
  });
}

export async function getControlNocturnoKpis(
  tenantId: string,
  dateFrom: Date,
  dateTo: Date,
): Promise<KpiAggregate> {
  const reportes = await fetchReports(tenantId, dateFrom, dateTo);
  return aggregateReports(reportes, dateFrom, dateTo);
}

export async function getControlNocturnoSnapshot(
  tenantId: string,
  baseDate: Date = new Date(),
): Promise<Snapshot> {
  const weekCurrentFrom = startOfWeek(baseDate);
  const weekCurrentTo = endOfDay(baseDate);
  const weekPrevFrom = addDays(weekCurrentFrom, -7);
  const weekPrevTo = endOfDay(addDays(weekCurrentTo, -7));

  const monthCurrentFrom = startOfMonth(baseDate);
  const monthCurrentTo = endOfDay(baseDate);
  const monthPrevFrom = startOfMonth(addMonths(baseDate, -1));
  const monthPrevTo = endOfDay(
    new Date(
      monthPrevFrom.getFullYear(),
      monthPrevFrom.getMonth(),
      Math.min(baseDate.getDate(), daysInMonth(monthPrevFrom.getFullYear(), monthPrevFrom.getMonth())),
    ),
  );

  const yearCurrentFrom = startOfYear(baseDate);
  const yearCurrentTo = endOfDay(baseDate);
  const prevYearDate = new Date(baseDate);
  prevYearDate.setFullYear(baseDate.getFullYear() - 1);
  const yearPrevFrom = startOfYear(prevYearDate);
  const yearPrevTo = endOfDay(prevYearDate);

  const [
    weekCurrent,
    weekPrevious,
    mtdCurrent,
    mtdPrevious,
    ytdCurrent,
    ytdPrevious,
  ] = await Promise.all([
    getControlNocturnoKpis(tenantId, weekCurrentFrom, weekCurrentTo),
    getControlNocturnoKpis(tenantId, weekPrevFrom, weekPrevTo),
    getControlNocturnoKpis(tenantId, monthCurrentFrom, monthCurrentTo),
    getControlNocturnoKpis(tenantId, monthPrevFrom, monthPrevTo),
    getControlNocturnoKpis(tenantId, yearCurrentFrom, yearCurrentTo),
    getControlNocturnoKpis(tenantId, yearPrevFrom, yearPrevTo),
  ]);

  return {
    week: comparePeriods(weekCurrent.global, weekPrevious.global),
    mtd: comparePeriods(mtdCurrent.global, mtdPrevious.global),
    ytd: comparePeriods(ytdCurrent.global, ytdPrevious.global),
  };
}

function comparePeriods(current: KpiGlobal, previous: KpiGlobal): PeriodComparison {
  return {
    current,
    previous,
    deltaCumplimiento: current.cumplimiento - previous.cumplimiento,
    deltaOmitidas: current.omitidas - previous.omitidas,
    deltaAlertCount: current.alertCount - previous.alertCount,
  };
}

function aggregateReports(
  reportes: RawReport[],
  dateFrom: Date,
  dateTo: Date,
): KpiAggregate {
  type InstAgg = {
    installationId: string | null;
    installationName: string;
    totalRondas: number;
    completadas: number;
    omitidas: number;
    pendientes: number;
    noAplica: number;
    desvMinutos: number[];
    reportCount: number;
    novedades: number;
    criticos: number;
  };
  const instMap = new Map<string, InstAgg>();

  type WeekAgg = {
    weekLabel: string;
    weekStart: string;
    totalRondas: number;
    completadas: number;
  };
  const weekMap = new Map<string, WeekAgg>();

  let globalTotal = 0;
  let globalCompletadas = 0;
  let globalOmitidas = 0;
  const globalDeviations: number[] = [];

  for (const rep of reportes) {
    const d = new Date(rep.date);
    const weekKey = getISOWeekKey(d);
    const weekStart = startOfWeek(d).toISOString().slice(0, 10);
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        weekLabel: weekKey,
        weekStart,
        totalRondas: 0,
        completadas: 0,
      });
    }
    const week = weekMap.get(weekKey)!;

    for (const inst of rep.instalaciones) {
      const key = inst.installationId || inst.installationName;
      if (!instMap.has(key)) {
        instMap.set(key, {
          installationId: inst.installationId,
          installationName: inst.installationName,
          totalRondas: 0,
          completadas: 0,
          omitidas: 0,
          pendientes: 0,
          noAplica: 0,
          desvMinutos: [],
          reportCount: 0,
          novedades: 0,
          criticos: 0,
        });
      }
      const agg = instMap.get(key)!;
      agg.reportCount++;
      if (inst.statusInstalacion === "novedad") agg.novedades++;
      if (inst.statusInstalacion === "critico") agg.criticos++;

      for (const r of inst.rondas) {
        if (r.status === "no_aplica") {
          agg.noAplica++;
          continue;
        }
        agg.totalRondas++;
        globalTotal++;
        week.totalRondas++;

        if (r.status === "completada") {
          agg.completadas++;
          globalCompletadas++;
          week.completadas++;
          if (r.horaMarcada && r.horaEsperada) {
            const dev = timeDiffMinutes(r.horaEsperada, r.horaMarcada);
            if (dev !== null) {
              agg.desvMinutos.push(dev);
              globalDeviations.push(dev);
            }
          }
        } else if (r.status === "omitida") {
          agg.omitidas++;
          globalOmitidas++;
        } else {
          agg.pendientes++;
        }
      }
    }
  }

  const installations = Array.from(instMap.values())
    .map((a) => {
      const cumplimiento =
        a.totalRondas > 0 ? Math.round((a.completadas / a.totalRondas) * 100) : 100;
      const avgDesvMin =
        a.desvMinutos.length > 0
          ? Math.round(a.desvMinutos.reduce((s, v) => s + v, 0) / a.desvMinutos.length)
          : 0;
      return {
        installationId: a.installationId,
        installationName: a.installationName,
        totalRondas: a.totalRondas,
        completadas: a.completadas,
        omitidas: a.omitidas,
        cumplimiento,
        avgDesvMin,
        reportCount: a.reportCount,
        novedades: a.novedades,
        criticos: a.criticos,
        alert: cumplimiento < ALERT_THRESHOLD,
      };
    })
    .sort((a, b) => a.cumplimiento - b.cumplimiento || b.omitidas - a.omitidas);

  const weeklyTrend = Array.from(weekMap.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => ({
      weekLabel: w.weekLabel,
      weekStart: w.weekStart,
      cumplimiento: w.totalRondas > 0 ? Math.round((w.completadas / w.totalRondas) * 100) : 100,
      totalRondas: w.totalRondas,
      completadas: w.completadas,
    }));

  const globalCumplimiento =
    globalTotal > 0 ? Math.round((globalCompletadas / globalTotal) * 100) : 100;
  const alertCount = installations.filter((i) => i.alert).length;
  const criticalCount = installations.filter((i) => i.criticos > 0).length;
  const avgDesvMin =
    globalDeviations.length > 0
      ? Math.round(globalDeviations.reduce((acc, val) => acc + val, 0) / globalDeviations.length)
      : 0;

  const topRisks = [...installations]
    .sort((a, b) => {
      const bRisk = (b.criticos > 0 ? 3 : 0) + (b.alert ? 2 : 0) + (b.omitidas > 0 ? 1 : 0);
      const aRisk = (a.criticos > 0 ? 3 : 0) + (a.alert ? 2 : 0) + (a.omitidas > 0 ? 1 : 0);
      return bRisk - aRisk || a.cumplimiento - b.cumplimiento;
    })
    .slice(0, 10);

  const topBest = [...installations]
    .sort((a, b) => b.cumplimiento - a.cumplimiento || a.omitidas - b.omitidas)
    .slice(0, 10);

  return {
    period: {
      from: dateFrom.toISOString().slice(0, 10),
      to: dateTo.toISOString().slice(0, 10),
      reportCount: reportes.length,
    },
    global: {
      totalRondas: globalTotal,
      completadas: globalCompletadas,
      omitidas: globalOmitidas,
      cumplimiento: globalCumplimiento,
      alertCount,
      criticalCount,
      avgDesvMin,
    },
    installations,
    weeklyTrend,
    topRisks,
    topBest,
  };
}

function startOfWeek(d: Date): Date {
  const tmp = new Date(d.getTime());
  tmp.setHours(0, 0, 0, 0);
  const day = tmp.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  tmp.setDate(tmp.getDate() + diff);
  return tmp;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(d: Date, months: number): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next;
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

function getISOWeekKey(d: Date): string {
  const tmp = new Date(d.getTime());
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    );
  return `S${weekNum}`;
}

function timeDiffMinutes(expected: string, actual: string): number | null {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };
  const e = toMin(expected);
  const a = toMin(actual);
  if (e === null || a === null) return null;
  let diff = a - e;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return Math.abs(diff);
}
