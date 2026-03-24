import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonitorTurnoPdfData {
  operatorName: string;
  startedAt: string;
  endedAt: string;
  // KPIs
  totalRounds: number;
  completadas: number;
  noRealizadas: number;
  trustAvg: number;
  criticalAlerts: number;
  // Deltas vs previous week
  deltaCompletadas: number;
  deltaNoRealizadas: number;
  deltaTrustAvg: number;
  deltaCriticalAlerts: number;
  // Reliability
  reliability: {
    score: number;
    nota: string;
    instalacionesAfectadas: string[];
    rondasAfectadas: number;
  };
  operatorComments?: string | null;
  // Panico
  panicos: {
    guardia: string;
    instalacion: string;
    hora: string;
    resolucion: string | null;
    tiempoRespuestaMin: number | null;
  }[];
  panicoStats30d: {
    total: number;
    sinResolucion: number;
    tiempoPromedioMin: number;
    peorTiempoMin: number;
    peorInstalacion: string;
  };
  // Semaforo
  semaforo: {
    instalacion: string;
    nivel: "rojo" | "amarillo" | "verde";
    razon: string;
    notaOperador?: string;
  }[];
  // Guard ranking
  guardRanking: {
    nombre: string;
    instalacion: string;
    rondas7d: string;
    cumpl: number;
    trustAvg: number;
    incidentes: number;
    tendencia: "up" | "down" | "stable";
  }[];
  // Installation 7-day matrix
  instalaciones: {
    name: string;
    horas: string[];
    grid: ("ok" | "ok_alert" | "fail" | "incomplete" | "na")[][];
    trustByDay: number[];
    alertsByDay: number[];
    cumplByDay: number[];
    trust7dAvg: number;
    trustLastTurno: number;
    alertsLastTurno: number;
    tendencia: "up" | "down" | "stable";
    notaOperador?: string;
    incidentes: {
      tipo: string;
      descripcion: string;
      guardia: string;
      hora: string;
      dia: string;
    }[];
  }[];
  // Day labels for the 7-day matrix columns
  dayLabels: { label: string; isToday: boolean }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trustColor(v: number): string {
  if (v >= 80) return "#15803d";
  if (v >= 60) return "#d97706";
  return "#dc2626";
}

function deltaHtml(value: number, suffix = ""): string {
  if (value > 0) return `<span style="color:#15803d;font-weight:600">&uarr; +${value}${suffix}</span>`;
  if (value < 0) return `<span style="color:#dc2626;font-weight:600">&darr; ${value}${suffix}</span>`;
  return `<span style="color:#64748b;font-weight:600">= 0${suffix}</span>`;
}

function tendenciaArrow(t: "up" | "down" | "stable"): string {
  if (t === "up") return `<span style="color:#15803d;font-weight:700">&uarr;</span>`;
  if (t === "down") return `<span style="color:#dc2626;font-weight:700">&darr;</span>`;
  return `<span style="color:#64748b;font-weight:700">=</span>`;
}

const CELL_BG: Record<string, string> = {
  ok: "#dcfce7",
  ok_alert: "#fef9c3",
  incomplete: "#fed7aa",
  fail: "#fee2e2",
  na: "#f1f5f9",
};

const CELL_LABEL: Record<string, string> = {
  ok: "&#10003;",
  ok_alert: "&#9888;",
  incomplete: "&#9679;",
  fail: "&#10007;",
  na: "&mdash;",
};

const CELL_COLOR: Record<string, string> = {
  ok: "#15803d",
  ok_alert: "#92400e",
  incomplete: "#c2410c",
  fail: "#dc2626",
  na: "#94a3b8",
};

const SEMAFORO_BORDER: Record<string, string> = {
  rojo: "#dc2626",
  amarillo: "#f59e0b",
  verde: "#22c55e",
};

const SEMAFORO_LABEL: Record<string, string> = {
  rojo: "Rojo - Accion Inmediata",
  amarillo: "Amarillo - Supervisar",
  verde: "Verde - OK",
};

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

function buildCoverPage(d: MonitorTurnoPdfData): string {
  const reliColor = trustColor(d.reliability.score);
  const affectedList = d.reliability.instalacionesAfectadas.length > 0
    ? d.reliability.instalacionesAfectadas.map((i) => escapeHtml(i)).join(", ")
    : "Ninguna";

  return `
  <!-- COVER -->
  <div style="margin-bottom:24px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
      <div>
        <h1 style="font-size:22px;font-weight:800;color:#1e293b;margin-bottom:2px">Gard Security</h1>
        <h2 style="font-size:15px;font-weight:600;color:#475569;margin-bottom:2px">Reporte Monitor de Turno</h2>
        <p style="font-size:11px;color:#64748b">Operador: <strong>${escapeHtml(d.operatorName)}</strong></p>
      </div>
      <div style="text-align:right">
        <p style="font-size:11px;color:#64748b">Inicio: <strong>${escapeHtml(d.startedAt)}</strong></p>
        <p style="font-size:11px;color:#64748b">Fin: <strong>${escapeHtml(d.endedAt)}</strong></p>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      ${kpiCard("Total Rondas", String(d.totalRounds), "#334155", "")}
      ${kpiCard("Completadas", String(d.completadas), "#15803d", deltaHtml(d.deltaCompletadas))}
      ${kpiCard("No Realizadas", String(d.noRealizadas), "#dc2626", deltaHtml(d.deltaNoRealizadas))}
      ${kpiCard("Trust Promedio", d.trustAvg.toFixed(1) + "%", trustColor(d.trustAvg), deltaHtml(d.deltaTrustAvg, "%"))}
      ${kpiCard("Alertas Criticas", String(d.criticalAlerts), d.criticalAlerts > 0 ? "#dc2626" : "#15803d", deltaHtml(d.deltaCriticalAlerts))}
    </div>

    <!-- Reliability -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:6px">
        <div>
          <span style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:600">Fiabilidad</span>
          <div style="font-size:28px;font-weight:800;color:${reliColor}">${d.reliability.score.toFixed(0)}%</div>
        </div>
        <div style="flex:1">
          <p style="font-size:11px;color:#334155;margin-bottom:2px"><strong>Nota:</strong> ${escapeHtml(d.reliability.nota)}</p>
          <p style="font-size:10px;color:#64748b">Instalaciones afectadas: ${affectedList}</p>
          <p style="font-size:10px;color:#64748b">Rondas afectadas: ${d.reliability.rondasAfectadas}</p>
        </div>
      </div>
    </div>

    ${d.operatorComments ? `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:16px">
      <p style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:4px">Comentarios del Operador</p>
      <p style="font-size:11px;color:#334155;white-space:pre-wrap">${escapeHtml(d.operatorComments)}</p>
    </div>` : ""}

    <!-- Legend -->
    <div style="display:flex;gap:14px;font-size:9px;color:#64748b;flex-wrap:wrap">
      <span><span style="display:inline-block;width:10px;height:10px;background:${CELL_BG.ok};border:1px solid #ccc;border-radius:2px;vertical-align:middle"></span> OK</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:${CELL_BG.ok_alert};border:1px solid #ccc;border-radius:2px;vertical-align:middle"></span> OK + Alerta</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:${CELL_BG.incomplete};border:1px solid #ccc;border-radius:2px;vertical-align:middle"></span> Incompleta</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:${CELL_BG.fail};border:1px solid #ccc;border-radius:2px;vertical-align:middle"></span> No Realizada</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:${CELL_BG.na};border:1px solid #ccc;border-radius:2px;vertical-align:middle"></span> N/A</span>
      <span style="margin-left:8px"><span style="color:#15803d">&uarr;</span> Mejora &nbsp;<span style="color:#dc2626">&darr;</span> Empeora &nbsp;<span style="color:#64748b">=</span> Sin cambio</span>
    </div>
  </div>
  <div style="page-break-after:always"></div>`;
}

function kpiCard(label: string, value: string, color: string, delta: string): string {
  return `<div style="flex:1;min-width:120px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px">
    <p style="font-size:9px;color:#64748b;text-transform:uppercase;font-weight:600;margin-bottom:4px">${label}</p>
    <p style="font-size:22px;font-weight:800;color:${color};margin-bottom:2px">${value}</p>
    <p style="font-size:10px">${delta}</p>
  </div>`;
}

function buildSemaforoPage(d: MonitorTurnoPdfData): string {
  const levels: ("rojo" | "amarillo" | "verde")[] = ["rojo", "amarillo", "verde"];

  const sections = levels.map((nivel) => {
    const items = d.semaforo.filter((s) => s.nivel === nivel);
    if (items.length === 0) {
      return `<div style="margin-bottom:12px">
        <h3 style="font-size:12px;font-weight:700;color:${SEMAFORO_BORDER[nivel]};margin-bottom:6px;border-left:4px solid ${SEMAFORO_BORDER[nivel]};padding-left:8px">${SEMAFORO_LABEL[nivel]}</h3>
        <p style="font-size:10px;color:#94a3b8;padding-left:12px">Sin instalaciones en este nivel.</p>
      </div>`;
    }

    const rows = items.map((s) => `
      <tr>
        <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;font-weight:600">${escapeHtml(s.instalacion)}</td>
        <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px">${escapeHtml(s.razon)}</td>
        <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;color:#64748b">${escapeHtml(s.notaOperador) || "&mdash;"}</td>
      </tr>`).join("");

    return `<div style="margin-bottom:12px">
      <h3 style="font-size:12px;font-weight:700;color:${SEMAFORO_BORDER[nivel]};margin-bottom:6px;border-left:4px solid ${SEMAFORO_BORDER[nivel]};padding-left:8px">${SEMAFORO_LABEL[nivel]}</h3>
      <table>
        <thead><tr>
          <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:left;font-weight:600">Instalacion</th>
          <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:left;font-weight:600">Razon</th>
          <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:left;font-weight:600">Nota Operador</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join("");

  return `
  <!-- SEMAFORO -->
  <div style="margin-bottom:24px">
    <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Semaforo de Accion</h2>
    ${sections}
  </div>
  <div style="page-break-after:always"></div>`;
}

function buildPanicosPage(d: MonitorTurnoPdfData): string {
  if (d.panicos.length === 0) return "";

  const rows = d.panicos.map((p) => `
    <tr>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px">${escapeHtml(p.guardia)}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px">${escapeHtml(p.instalacion)}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:center">${escapeHtml(p.hora)}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px">${p.resolucion ? escapeHtml(p.resolucion) : `<span style="color:#dc2626;font-weight:600">Sin resolucion</span>`}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:center">${p.tiempoRespuestaMin != null ? `${p.tiempoRespuestaMin} min` : `<span style="color:#dc2626">&mdash;</span>`}</td>
    </tr>`).join("");

  const stats = d.panicoStats30d;

  return `
  <!-- PANICOS -->
  <div style="margin-bottom:24px">
    <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Alertas de Panico</h2>
    <table>
      <thead><tr>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:left;font-weight:600">Guardia</th>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:left;font-weight:600">Instalacion</th>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:center;font-weight:600">Hora</th>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:left;font-weight:600">Resolucion</th>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:center;font-weight:600">Tiempo Resp.</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="margin-top:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px">
      <p style="font-size:10px;font-weight:700;color:#991b1b;margin-bottom:6px">Resumen ultimos 30 dias</p>
      <div style="display:flex;gap:16px;font-size:10px;color:#334155;flex-wrap:wrap">
        <span>Total: <strong>${stats.total}</strong></span>
        <span>Sin resolucion: <strong style="color:#dc2626">${stats.sinResolucion}</strong></span>
        <span>Tiempo promedio: <strong>${stats.tiempoPromedioMin.toFixed(1)} min</strong></span>
        <span>Peor tiempo: <strong style="color:#dc2626">${stats.peorTiempoMin.toFixed(1)} min</strong></span>
        <span>Peor instalacion: <strong>${escapeHtml(stats.peorInstalacion)}</strong></span>
      </div>
    </div>
  </div>
  <div style="page-break-after:always"></div>`;
}

function buildGuardRankingPage(d: MonitorTurnoPdfData): string {
  const sorted = [...d.guardRanking].sort((a, b) => a.cumpl - b.cumpl);

  const rows = sorted.map((g) => {
    const cumplColor = trustColor(g.cumpl);
    const trustClr = trustColor(g.trustAvg);
    return `<tr>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;font-weight:600">${escapeHtml(g.nombre)}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px">${escapeHtml(g.instalacion)}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:center">${escapeHtml(g.rondas7d)}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:center;font-weight:700;color:${cumplColor}">${g.cumpl.toFixed(0)}%</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:center;font-weight:700;color:${trustClr}">${g.trustAvg.toFixed(1)}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:center;${g.incidentes > 0 ? "color:#dc2626;font-weight:700" : ""}">${g.incidentes}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:center">${tendenciaArrow(g.tendencia)}</td>
    </tr>`;
  }).join("");

  return `
  <!-- GUARD RANKING -->
  <div style="margin-bottom:24px">
    <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Ranking de Guardias</h2>
    <table>
      <thead><tr>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:left;font-weight:600">Nombre</th>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:left;font-weight:600">Instalacion</th>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:center;font-weight:600">Rondas 7d</th>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:center;font-weight:600">Cumpl. %</th>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:center;font-weight:600">Trust</th>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:center;font-weight:600">Incidentes</th>
        <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:center;font-weight:600">Tend.</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div style="page-break-after:always"></div>`;
}

function buildInstalacionesPages(d: MonitorTurnoPdfData): string {
  // Sort by last-day cumpl ascending (worst first)
  const sorted = [...d.instalaciones].sort((a, b) => {
    const aLast = a.cumplByDay[a.cumplByDay.length - 1] ?? 100;
    const bLast = b.cumplByDay[b.cumplByDay.length - 1] ?? 100;
    return aLast - bLast;
  });

  return sorted.map((inst, idx) => {
    const trustClr = trustColor(inst.trust7dAvg);
    const trustLastClr = trustColor(inst.trustLastTurno);

    // Day header row
    const dayHeaders = d.dayLabels.map((dl) => {
      const bg = dl.isToday ? "#dbeafe" : "#f8fafc";
      const clr = dl.isToday ? "#1d4ed8" : "#64748b";
      return `<th style="padding:3px 4px;border:1px solid #e2e8f0;font-size:8px;background:${bg};color:${clr};text-align:center;font-weight:600;min-width:48px">${escapeHtml(dl.label)}</th>`;
    }).join("");

    // Grid rows (horas x days)
    const gridRows = inst.horas.map((hora, rowIdx) => {
      const cells = d.dayLabels.map((dl, colIdx) => {
        const status = inst.grid[rowIdx]?.[colIdx] ?? "na";
        const bg = dl.isToday
          ? blendTodayBg(CELL_BG[status] || CELL_BG.na)
          : (CELL_BG[status] || CELL_BG.na);
        const clr = CELL_COLOR[status] || CELL_COLOR.na;
        const label = CELL_LABEL[status] || "&mdash;";
        const borderClr = dl.isToday ? "#93c5fd" : "#e2e8f0";
        return `<td style="text-align:center;padding:2px 3px;background:${bg};color:${clr};font-size:9px;font-weight:600;border:1px solid ${borderClr}">${label}</td>`;
      }).join("");
      return `<tr>
        <td style="padding:2px 6px;border:1px solid #e2e8f0;font-size:9px;font-weight:600;background:#f8fafc;color:#475569;white-space:nowrap">${escapeHtml(hora)}</td>
        ${cells}
      </tr>`;
    }).join("");

    // Summary rows: Trust, Alertas, Cumpl.%
    const trustRow = d.dayLabels.map((dl, colIdx) => {
      const v = inst.trustByDay[colIdx] ?? 0;
      const bg = dl.isToday ? "#dbeafe" : "#f8fafc";
      const clr = trustColor(v);
      return `<td style="text-align:center;padding:2px 3px;background:${bg};font-size:9px;font-weight:700;color:${clr};border:1px solid #e2e8f0">${v.toFixed(0)}</td>`;
    }).join("");

    const alertsRow = d.dayLabels.map((dl, colIdx) => {
      const v = inst.alertsByDay[colIdx] ?? 0;
      const bg = dl.isToday ? "#dbeafe" : "#f8fafc";
      const clr = v > 0 ? "#dc2626" : "#64748b";
      return `<td style="text-align:center;padding:2px 3px;background:${bg};font-size:9px;font-weight:600;color:${clr};border:1px solid #e2e8f0">${v}</td>`;
    }).join("");

    const cumplRow = d.dayLabels.map((dl, colIdx) => {
      const v = inst.cumplByDay[colIdx] ?? 0;
      const bg = dl.isToday ? "#dbeafe" : "#f8fafc";
      const clr = trustColor(v);
      return `<td style="text-align:center;padding:2px 3px;background:${bg};font-size:9px;font-weight:700;color:${clr};border:1px solid #e2e8f0">${v.toFixed(0)}%</td>`;
    }).join("");

    // Incidentes
    const incidentesHtml = inst.incidentes.length > 0
      ? `<div style="margin-top:8px">
          <p style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:4px">Incidentes</p>
          ${inst.incidentes.map((inc) => `<div style="font-size:9px;color:#334155;margin-bottom:2px;padding-left:8px">
            <span style="color:#94a3b8">${escapeHtml(inc.dia)} ${escapeHtml(inc.hora)}</span> &mdash;
            <strong>${escapeHtml(inc.tipo)}</strong>: ${escapeHtml(inc.descripcion)}
            <span style="color:#94a3b8">(${escapeHtml(inc.guardia)})</span>
          </div>`).join("")}
        </div>`
      : "";

    const notaHtml = inst.notaOperador
      ? `<div style="margin-top:6px;font-size:9px;color:#334155"><strong style="color:#64748b">Nota operador:</strong> ${escapeHtml(inst.notaOperador)}</div>`
      : "";

    const pageBreak = idx < sorted.length - 1 ? `<div style="page-break-after:always"></div>` : "";

    return `
    <!-- INSTALACION: ${escapeHtml(inst.name)} -->
    <div style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="font-size:13px;font-weight:700;color:#1e293b">${escapeHtml(inst.name)}</h3>
        <div style="display:flex;gap:12px;font-size:10px">
          <span>Trust 7d: <strong style="color:${trustClr}">${inst.trust7dAvg.toFixed(1)}%</strong></span>
          <span>Trust turno: <strong style="color:${trustLastClr}">${inst.trustLastTurno.toFixed(1)}%</strong></span>
          <span>Alertas: <strong style="${inst.alertsLastTurno > 0 ? "color:#dc2626" : ""}">${inst.alertsLastTurno}</strong></span>
          <span>${tendenciaArrow(inst.tendencia)}</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="padding:3px 6px;border:1px solid #e2e8f0;font-size:9px;background:#f8fafc;color:#64748b;text-align:left;font-weight:600">Hora</th>
            ${dayHeaders}
          </tr>
        </thead>
        <tbody>
          ${gridRows}
          <tr>
            <td style="padding:2px 6px;border:1px solid #e2e8f0;font-size:9px;font-weight:700;background:#f1f5f9;color:#475569">Trust</td>
            ${trustRow}
          </tr>
          <tr>
            <td style="padding:2px 6px;border:1px solid #e2e8f0;font-size:9px;font-weight:700;background:#f1f5f9;color:#475569">Alertas</td>
            ${alertsRow}
          </tr>
          <tr>
            <td style="padding:2px 6px;border:1px solid #e2e8f0;font-size:9px;font-weight:700;background:#f1f5f9;color:#475569">Cumpl. %</td>
            ${cumplRow}
          </tr>
        </tbody>
      </table>

      ${incidentesHtml}
      ${notaHtml}
    </div>
    ${pageBreak}`;
  }).join("");
}

/** Slightly tint a cell bg with blue when it falls on today's column. */
function blendTodayBg(cellBg: string): string {
  // Overlay a very light blue tint — just darken slightly toward blue
  // We keep the base cell color but add a blue-ish border instead.
  // For simplicity, return the original cell bg (the blue border handles the highlight).
  return cellBg;
}

// ---------------------------------------------------------------------------
// Main HTML builder
// ---------------------------------------------------------------------------

export function buildMonitorTurnoPdfHtml(data: MonitorTurnoPdfData): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    @page {
      margin: 15mm 12mm;
      size: A4 landscape;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #ffffff;
      color: #1e293b;
      padding: 0;
      font-size: 11px;
      line-height: 1.4;
    }
    table { border-collapse: collapse; width: 100%; }
    th, td { vertical-align: top; }
    h2 { page-break-after: avoid; }
  </style>
</head>
<body>

${buildCoverPage(data)}
${buildSemaforoPage(data)}
${buildPanicosPage(data)}
${buildGuardRankingPage(data)}

<!-- DETALLE POR INSTALACION -->
<div>
  <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">Detalle por Instalacion</h2>
  ${buildInstalacionesPages(data)}
</div>

<!-- FOOTER -->
<div style="margin-top:24px;padding-top:8px;border-top:1px solid #e2e8f0;text-align:center">
  <p style="font-size:9px;color:#94a3b8">Sistema OPAI &mdash; Reporte generado automaticamente</p>
</div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// PDF renderer (Playwright / Chromium)
// ---------------------------------------------------------------------------

export async function renderMonitorTurnoPdfBuffer(
  data: MonitorTurnoPdfData,
): Promise<Uint8Array> {
  const html = buildMonitorTurnoPdfHtml(data);
  const isDev = process.env.NODE_ENV === "development";
  const executablePath = isDev ? undefined : await chromiumPkg.executablePath();

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: isDev ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromiumPkg.args,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" },
    });
    return new Uint8Array(pdfBuffer);
  } finally {
    await browser.close();
  }
}
