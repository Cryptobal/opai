/**
 * Builds the enriched report data (7-day history, guard ranking,
 * semáforo, deltas, reliability) for the turno close email + PDF.
 */

import { prisma } from "@/lib/prisma";
import type { MonitorTurnoPdfData } from "./monitor-turno-pdf";
import type {
  MonitorEmailData,
  PanicoEmailDetail,
  SemaforoItem,
  InstallationSummary,
} from "./monitor-email";

// ─── Types ─────────────────────────────────────────────────────────────

interface RoundRow {
  id: string;
  status: string;
  trustScore: number | null;
  scheduledAt: Date;
  completedAt: Date | null;
  guardiaId: string | null;
  rondaTemplate: { name: true; installation: { name: string } | null } | null;
}

interface AlertRow {
  tipo: string;
  severidad: string;
  mensaje: string;
  installationId: string | null;
  resuelta: boolean;
  resueltaAt: Date | null;
  createdAt: Date;
  installation: { name: string } | null;
}

// ─── Main builder ──────────────────────────────────────────────────────

export async function buildTurnoReportData(opts: {
  tenantId: string;
  turnoStartedAt: Date;
  turnoEndedAt: Date;
  roundsData: RoundRow[];
  alertsData: AlertRow[];
  operatorName: string;
  operatorComments?: string | null;
}): Promise<{
  panicos: PanicoEmailDetail[];
  panicoStats30d: MonitorEmailData["panicoStats30d"];
  deltaCompletadas: number;
  deltaNoRealizadas: number;
  deltaTrustAvg: number;
  deltaCriticalAlerts: number;
  semaforo: SemaforoItem[];
  reliability: { score: number; nota: string };
  installationSummaries: InstallationSummary[];
  pdfData: MonitorTurnoPdfData;
}> {
  const { tenantId, turnoStartedAt, turnoEndedAt, roundsData, alertsData, operatorName, operatorComments } = opts;

  // ── Current turno KPIs ─────────────────────────────────────────────
  const completadas = roundsData.filter(r => r.status === "completada").length;
  const noRealizadas = roundsData.filter(r => r.status === "no_realizada").length;
  const totalRounds = roundsData.length;
  const trustAvg = totalRounds > 0
    ? Math.round(roundsData.reduce((s, r) => s + (r.trustScore ?? 0), 0) / totalRounds)
    : 0;
  const criticalAlerts = alertsData.filter(a => a.severidad === "critical").length;

  // ── 7-day window ───────────────────────────────────────────────────
  const sevenDaysAgo = new Date(turnoEndedAt);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [histRounds, histAlerts, panicoAlerts30d, prevWeekRounds, prevWeekAlerts] = await Promise.all([
    // Last 7 days of rounds
    prisma.opsRondaEjecucion.findMany({
      where: { tenantId, scheduledAt: { gte: sevenDaysAgo, lte: turnoEndedAt } },
      select: {
        id: true, status: true, trustScore: true, scheduledAt: true, completedAt: true, guardiaId: true,
        rondaTemplate: { select: { name: true, installation: { select: { id: true, name: true } } } },
        guardia: { select: { id: true, persona: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    // Last 7 days of alerts
    prisma.opsAlertaRonda.findMany({
      where: { tenantId, createdAt: { gte: sevenDaysAgo, lte: turnoEndedAt } },
      select: { tipo: true, severidad: true, createdAt: true, resuelta: true, resueltaAt: true, installation: { select: { name: true } } },
    }),
    // Panic alerts last 30 days
    prisma.opsAlertaRonda.findMany({
      where: { tenantId, tipo: "panico", createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      select: {
        tipo: true, resuelta: true, resueltaAt: true, createdAt: true,
        installation: { select: { name: true } },
        guardia: { select: { persona: { select: { firstName: true, lastName: true } } } },
      },
    }),
    // Previous week rounds (for deltas)
    prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId,
        scheduledAt: { gte: new Date(sevenDaysAgo.getTime() - 7 * 86400000), lt: sevenDaysAgo },
      },
      select: { status: true, trustScore: true },
    }),
    // Previous week alerts (for deltas)
    prisma.opsAlertaRonda.findMany({
      where: {
        tenantId,
        createdAt: { gte: new Date(sevenDaysAgo.getTime() - 7 * 86400000), lt: sevenDaysAgo },
      },
      select: { severidad: true },
    }),
  ]);

  // ── Deltas ─────────────────────────────────────────────────────────
  const prevCompletadas = prevWeekRounds.filter(r => r.status === "completada").length;
  const prevNoRealizadas = prevWeekRounds.filter(r => r.status === "no_realizada").length;
  const prevTrustAvg = prevWeekRounds.length > 0
    ? Math.round(prevWeekRounds.reduce((s, r) => s + (r.trustScore ?? 0), 0) / prevWeekRounds.length)
    : 0;
  const prevCritical = prevWeekAlerts.filter(a => a.severidad === "critical").length;

  // ── Pánico details ─────────────────────────────────────────────────
  const currentPanicos = alertsData.filter(a => a.tipo === "panico");
  const panicos: PanicoEmailDetail[] = currentPanicos.map(a => {
    const inc = roundsData.find(r => r.rondaTemplate?.installation?.name === a.installation?.name);
    return {
      guardia: "—", // will be enriched from incidentes
      instalacion: a.installation?.name ?? "—",
      hora: a.createdAt
        ? new Date(a.createdAt).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
        : "—",
      resolucion: a.resuelta ? (a.mensaje || "Resuelta") : null,
      tiempoRespuestaMin: a.resueltaAt
        ? Math.round((new Date(a.resueltaAt).getTime() - new Date(a.createdAt).getTime()) / 60000)
        : null,
    };
  });

  // Pánico 30d stats
  const unresolvedPanicos30d = panicoAlerts30d.filter(p => !p.resuelta).length;
  const resolvedPanicos30d = panicoAlerts30d.filter(p => p.resuelta && p.resueltaAt);
  const avgResponseTime = resolvedPanicos30d.length > 0
    ? Math.round(resolvedPanicos30d.reduce((s, p) => s + (new Date(p.resueltaAt!).getTime() - new Date(p.createdAt).getTime()) / 60000, 0) / resolvedPanicos30d.length * 10) / 10
    : 0;
  const worstResponse = resolvedPanicos30d.reduce((max, p) => {
    const t = (new Date(p.resueltaAt!).getTime() - new Date(p.createdAt).getTime()) / 60000;
    return t > max.time ? { time: t, inst: p.installation?.name ?? "—" } : max;
  }, { time: 0, inst: "—" });

  const panicoStats30d = {
    total: panicoAlerts30d.length,
    sinResolucion: unresolvedPanicos30d,
    tiempoPromedioMin: avgResponseTime,
    peorTiempoMin: Math.round(worstResponse.time),
    peorInstalacion: worstResponse.inst,
  };

  // ── Per-installation analysis (7 days) ─────────────────────────────
  const instDataMap = new Map<string, {
    name: string;
    roundsByDay: Map<string, typeof histRounds>;
    alertsByDay: Map<string, typeof histAlerts>;
    guardias: Map<string, { nombre: string; rounds: typeof histRounds }>;
  }>();

  for (const r of histRounds) {
    const instName = r.rondaTemplate?.installation?.name ?? "Sin instalación";
    if (!instDataMap.has(instName)) {
      instDataMap.set(instName, { name: instName, roundsByDay: new Map(), alertsByDay: new Map(), guardias: new Map() });
    }
    const inst = instDataMap.get(instName)!;
    const dayKey = r.scheduledAt.toISOString().slice(0, 10);
    if (!inst.roundsByDay.has(dayKey)) inst.roundsByDay.set(dayKey, []);
    inst.roundsByDay.get(dayKey)!.push(r);

    // Guard tracking
    if (r.guardia) {
      const gName = `${r.guardia.persona?.firstName ?? ""} ${r.guardia.persona?.lastName ?? ""}`.trim() || r.guardiaId || "—";
      if (!inst.guardias.has(gName)) inst.guardias.set(gName, { nombre: gName, rounds: [] });
      inst.guardias.get(gName)!.rounds.push(r);
    }
  }
  for (const a of histAlerts) {
    const instName = a.installation?.name ?? "Sin instalación";
    if (!instDataMap.has(instName)) {
      instDataMap.set(instName, { name: instName, roundsByDay: new Map(), alertsByDay: new Map(), guardias: new Map() });
    }
    const inst = instDataMap.get(instName)!;
    const dayKey = a.createdAt.toISOString().slice(0, 10);
    if (!inst.alertsByDay.has(dayKey)) inst.alertsByDay.set(dayKey, []);
    inst.alertsByDay.get(dayKey)!.push(a);
  }

  // Generate day labels for 7-day matrix
  const dayLabels: { label: string; date: string; isToday: boolean }[] = [];
  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(turnoEndedAt);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    dayLabels.push({
      label: `${dayNames[d.getDay()]} ${d.getDate()}`,
      date: dateStr,
      isToday: i === 0,
    });
  }

  // Build installation matrix data
  type CellStatus = "ok" | "ok_alert" | "fail" | "incomplete" | "na";

  const installations: MonitorTurnoPdfData["instalaciones"] = [];
  const installationSummaries: InstallationSummary[] = [];
  const semaforo: SemaforoItem[] = [];

  for (const [, instData] of instDataMap) {
    // Collect unique horas
    const horasSet = new Set<string>();
    for (const [, rounds] of instData.roundsByDay) {
      for (const r of rounds) {
        horasSet.add(r.scheduledAt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }));
      }
    }
    const horas = [...horasSet].sort();
    if (horas.length === 0) continue;

    // Build grid
    const grid: CellStatus[][] = [];
    const trustByDay: number[] = [];
    const alertsByDay: number[] = [];
    const cumplByDay: number[] = [];

    for (const day of dayLabels) {
      const dayRounds = instData.roundsByDay.get(day.date) ?? [];
      const dayAlerts = instData.alertsByDay.get(day.date) ?? [];

      const dayTrust = dayRounds.length > 0
        ? Math.round(dayRounds.reduce((s, r) => s + (r.trustScore ?? 0), 0) / dayRounds.length)
        : 0;
      const dayCompleted = dayRounds.filter(r => r.status === "completada").length;
      const dayCumpl = dayRounds.length > 0 ? Math.round((dayCompleted / dayRounds.length) * 100) : 0;

      trustByDay.push(dayTrust);
      alertsByDay.push(dayAlerts.length);
      cumplByDay.push(dayCumpl);
    }

    // Build grid per hora per day
    for (const hora of horas) {
      const row: CellStatus[] = [];
      for (const day of dayLabels) {
        const dayRounds = instData.roundsByDay.get(day.date) ?? [];
        const match = dayRounds.find(r =>
          r.scheduledAt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) === hora
        );
        if (!match) {
          row.push("na");
        } else if (match.status === "completada") {
          const dayAlerts = instData.alertsByDay.get(day.date) ?? [];
          row.push(dayAlerts.length > 0 ? "ok_alert" : "ok");
        } else if (match.status === "incompleta") {
          row.push("incomplete");
        } else {
          row.push("fail");
        }
      }
      grid.push(row);
    }

    const lastDayCumpl = cumplByDay[cumplByDay.length - 1] ?? 0;
    const trust7dAvg = trustByDay.filter(t => t > 0).length > 0
      ? Math.round(trustByDay.reduce((s, t) => s + t, 0) / trustByDay.filter(t => t > 0).length)
      : 0;
    const trustLastTurno = trustByDay[trustByDay.length - 1] ?? 0;
    const alertsLastTurno = alertsByDay[alertsByDay.length - 1] ?? 0;

    // Determine tendencia
    const recentCumpl = cumplByDay.slice(-3);
    let tendencia: "up" | "down" | "stable" = "stable";
    if (recentCumpl.length >= 2) {
      const isDecreasing = recentCumpl.every((v, i) => i === 0 || v <= recentCumpl[i - 1]);
      const isIncreasing = recentCumpl.every((v, i) => i === 0 || v >= recentCumpl[i - 1]);
      if (isDecreasing && recentCumpl[0] > recentCumpl[recentCumpl.length - 1]) tendencia = "down";
      else if (isIncreasing && recentCumpl[0] < recentCumpl[recentCumpl.length - 1]) tendencia = "up";
    }

    // Incidentes from current turno for this installation
    const instIncidentes = alertsData
      .filter(a => a.installation?.name === instData.name && (a.tipo === "panico" || a.severidad === "critical"))
      .map(a => ({
        tipo: a.tipo,
        descripcion: a.mensaje,
        guardia: "—",
        hora: new Date(a.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
        dia: new Date(a.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }),
      }));

    installations.push({
      name: instData.name,
      horas,
      grid,
      trustByDay,
      alertsByDay,
      cumplByDay,
      trust7dAvg,
      trustLastTurno,
      alertsLastTurno,
      tendencia,
      incidentes: instIncidentes,
    });

    // Installation summary for email
    const lastDayRounds = instData.roundsByDay.get(dayLabels[dayLabels.length - 1]?.date) ?? [];
    installationSummaries.push({
      name: instData.name,
      totalRondas: lastDayRounds.length || horas.length,
      completadas: lastDayRounds.filter(r => r.status === "completada").length,
      alertCount: alertsLastTurno,
      trustAvg: trustLastTurno,
      cumplimiento: lastDayCumpl,
    });

    // Semáforo logic
    const lastThreeCumpl = cumplByDay.slice(-3);
    const consecutiveBad = lastThreeCumpl.filter(c => c < 50).length;
    if (consecutiveBad >= 3) {
      semaforo.push({ instalacion: instData.name, nivel: "rojo", razon: `${consecutiveBad} noches consecutivas bajo 50% cumplimiento` });
    } else if (tendencia === "down" && lastDayCumpl < 80) {
      semaforo.push({ instalacion: instData.name, nivel: "amarillo", razon: `Tendencia a la baja (${cumplByDay[0]}% → ${lastDayCumpl}%)` });
    } else if (lastDayCumpl >= 80) {
      semaforo.push({ instalacion: instData.name, nivel: "verde", razon: "Cumplimiento estable sobre 80%" });
    }
  }

  // Sort installations by last day cumplimiento ASC (worst first)
  installations.sort((a, b) => (a.cumplByDay[a.cumplByDay.length - 1] ?? 0) - (b.cumplByDay[b.cumplByDay.length - 1] ?? 0));

  // ── Guard ranking ──────────────────────────────────────────────────
  const guardMap = new Map<string, { nombre: string; instalacion: string; total: number; completed: number; trustSum: number; incidentes: number; tendencia: "up" | "down" | "stable" }>();
  for (const [, instData] of instDataMap) {
    for (const [gName, gData] of instData.guardias) {
      if (!guardMap.has(gName)) {
        guardMap.set(gName, { nombre: gName, instalacion: instData.name, total: 0, completed: 0, trustSum: 0, incidentes: 0, tendencia: "stable" });
      }
      const g = guardMap.get(gName)!;
      g.total += gData.rounds.length;
      g.completed += gData.rounds.filter(r => r.status === "completada").length;
      g.trustSum += gData.rounds.reduce((s, r) => s + (r.trustScore ?? 0), 0);
    }
  }

  const guardRanking = [...guardMap.values()]
    .map(g => ({
      nombre: g.nombre,
      instalacion: g.instalacion,
      rondas7d: `${g.completed}/${g.total}`,
      cumpl: g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0,
      trustAvg: g.total > 0 ? Math.round(g.trustSum / g.total) : 0,
      incidentes: g.incidentes,
      tendencia: g.tendencia,
    }))
    .sort((a, b) => a.cumpl - b.cumpl);

  // ── Reliability ────────────────────────────────────────────────────
  // Check if operator mentioned app problems
  const comments = (operatorComments ?? "").toUpperCase();
  const appProblems = comments.includes("APP") || comments.includes("PROBLEMA") || comments.includes("ERROR");
  const affectedInsts = installations.filter(i =>
    i.tendencia === "down" && comments.includes(i.name.toUpperCase().split(" ")[0])
  ).map(i => i.name);
  const reliabilityScore = appProblems ? Math.max(50, 100 - affectedInsts.length * 10) : 95;
  const reliabilityNota = appProblems
    ? `Se detectaron ${affectedInsts.length} instalaciones con problemas reportados de app. Las rondas no realizadas podrían no reflejar el desempeño real del guardia.`
    : "Sin problemas de conectividad reportados.";

  // ── PDF data ───────────────────────────────────────────────────────
  const fmtDt = (d: Date) => d.toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const pdfData: MonitorTurnoPdfData = {
    operatorName,
    startedAt: fmtDt(turnoStartedAt),
    endedAt: fmtDt(turnoEndedAt),
    totalRounds,
    completadas,
    noRealizadas,
    trustAvg,
    criticalAlerts,
    deltaCompletadas: completadas - prevCompletadas,
    deltaNoRealizadas: noRealizadas - prevNoRealizadas,
    deltaTrustAvg: trustAvg - prevTrustAvg,
    deltaCriticalAlerts: criticalAlerts - prevCritical,
    reliability: { score: reliabilityScore, nota: reliabilityNota, instalacionesAfectadas: affectedInsts, rondasAfectadas: affectedInsts.length * 8 },
    operatorComments,
    panicos: panicos.map(p => ({ ...p })),
    panicoStats30d,
    semaforo: semaforo.map(s => ({ ...s })),
    guardRanking,
    instalaciones: installations,
    dayLabels: dayLabels.map(d => ({ label: d.label, isToday: d.isToday })),
  };

  return {
    panicos,
    panicoStats30d,
    deltaCompletadas: completadas - prevCompletadas,
    deltaNoRealizadas: noRealizadas - prevNoRealizadas,
    deltaTrustAvg: trustAvg - prevTrustAvg,
    deltaCriticalAlerts: criticalAlerts - prevCritical,
    semaforo,
    reliability: { score: reliabilityScore, nota: reliabilityNota },
    installationSummaries,
    pdfData,
  };
}
