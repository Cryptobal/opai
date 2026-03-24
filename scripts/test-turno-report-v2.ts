/**
 * Script para enviar email de prueba con el diseño V3 del reporte de turno.
 * Incluye: email + PDF con matriz 7 días + semáforo + ranking guardias + deltas + resolución alertas + confiabilidad
 *
 * Uso: npx tsx scripts/test-turno-report-v2.ts carlos.irigoyen@gmail.com
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM || "OPAI <opai@gard.cl>";

// ─── Helpers ───────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function trustColor(score: number): string {
  if (score >= 80) return "#15803d";
  if (score >= 60) return "#d97706";
  return "#dc2626";
}
function deltaArrow(val: number): string {
  if (val > 0) return `<span style="color:#15803d;font-weight:600">↑ +${val}</span>`;
  if (val < 0) return `<span style="color:#dc2626;font-weight:600">↓ ${val}</span>`;
  return `<span style="color:#64748b">=</span>`;
}

// ─── Mock Data ─────────────────────────────────────────────────────────

interface PanicoAlert {
  guardia: string;
  instalacion: string;
  hora: string;
  resolucion: string | null;
  tiempoRespuestaMin: number | null; // null = sin resolver
}

const mockPanicos: PanicoAlert[] = [
  { guardia: "Osvaldo Francisco Escobar Jorquera", instalacion: "Embajada Brasil", hora: "15-mar, 12:19 a.m.", resolucion: "Falsa alarma - guardia presionó botón accidentalmente al cambiar de posición", tiempoRespuestaMin: 4 },
  { guardia: "Hans Eduardo Ceballo Sandoval", instalacion: "Metropolitan", hora: "15-mar, 11:18 a.m.", resolucion: null, tiempoRespuestaMin: null },
];

// ─── Guard ranking mock ────────────────────────────────────────────────

interface GuardRanking {
  nombre: string;
  instalacion: string;
  rondas7d: string; // "28/77"
  cumpl: number;
  trustAvg: number;
  incidentes: number;
  tendencia: "up" | "down" | "stable";
}

const mockGuardRanking: GuardRanking[] = [
  { nombre: "Roberto Fuentes", instalacion: "Fapama Quinta Normal", rondas7d: "0/77", cumpl: 0, trustAvg: 0, incidentes: 0, tendencia: "down" },
  { nombre: "Miguel Sepúlveda", instalacion: "Fapama Reñaca", rondas7d: "0/77", cumpl: 0, trustAvg: 0, incidentes: 0, tendencia: "down" },
  { nombre: "Andrés Gómez", instalacion: "Gard", rondas7d: "0/70", cumpl: 0, trustAvg: 0, incidentes: 0, tendencia: "down" },
  { nombre: "Luis Contreras", instalacion: "Polpaico Coronel", rondas7d: "55/63", cumpl: 87, trustAvg: 75, incidentes: 0, tendencia: "down" },
  { nombre: "Carlos Muñoz", instalacion: "Cims", rondas7d: "28/77", cumpl: 36, trustAvg: 35, incidentes: 1, tendencia: "down" },
  { nombre: "Osvaldo Escobar", instalacion: "Embajada Brasil", rondas7d: "42/70", cumpl: 60, trustAvg: 68, incidentes: 1, tendencia: "down" },
  { nombre: "Pedro Soto", instalacion: "Polpaico Quilicura", rondas7d: "38/42", cumpl: 90, trustAvg: 82, incidentes: 1, tendencia: "stable" },
  { nombre: "Felipe Torres", instalacion: "Polpaico El Bosque", rondas7d: "56/70", cumpl: 80, trustAvg: 80, incidentes: 0, tendencia: "down" },
  { nombre: "Jorge Ramírez", instalacion: "EW-Quilicura", rondas7d: "70/70", cumpl: 100, trustAvg: 89, incidentes: 0, tendencia: "stable" },
  { nombre: "Patricio Vega", instalacion: "Scrb San Bernardo", rondas7d: "35/35", cumpl: 100, trustAvg: 85, incidentes: 0, tendencia: "stable" },
  { nombre: "Ricardo Lagos", instalacion: "Bodega Santa Amalia", rondas7d: "49/49", cumpl: 100, trustAvg: 88, incidentes: 0, tendencia: "stable" },
  { nombre: "Hans Ceballo", instalacion: "Metropolitan", rondas7d: "N/A", cumpl: 0, trustAvg: 0, incidentes: 1, tendencia: "down" },
];

// ─── Semáforo / action-required mock ───────────────────────────────────

interface SemaforoItem {
  instalacion: string;
  nivel: "rojo" | "amarillo" | "verde";
  razon: string;
  diasConsecutivos?: number;
  notaOperador?: string;
}

const mockSemaforo: SemaforoItem[] = [
  { instalacion: "Fapama Quinta Normal", nivel: "rojo", razon: "3 noches consecutivas con 0% cumplimiento", diasConsecutivos: 3, notaOperador: "Problemas recurrentes con la app" },
  { instalacion: "Fapama Reñaca", nivel: "rojo", razon: "3 noches consecutivas con 0% cumplimiento", diasConsecutivos: 3 },
  { instalacion: "Gard", nivel: "rojo", razon: "3 noches consecutivas con 0% cumplimiento", diasConsecutivos: 3 },
  { instalacion: "Cims", nivel: "amarillo", razon: "Tendencia a la baja por 5 días (100% → 36%)", diasConsecutivos: 5, notaOperador: "App presentó problemas en menor proporción" },
  { instalacion: "Embajada Brasil", nivel: "amarillo", razon: "Tendencia a la baja por 4 días (100% → 40%)", diasConsecutivos: 4, notaOperador: "App presentó problemas" },
  { instalacion: "Polpaico El Bosque", nivel: "amarillo", razon: "Tendencia a la baja por 3 días (100% → 70%)", diasConsecutivos: 3, notaOperador: "App presentó problemas en menor proporción" },
  { instalacion: "Polpaico Coronel", nivel: "amarillo", razon: "Caída abrupta último turno (100% → 11%)", notaOperador: "No se reportaron rondas por mal tiempo de lluvias" },
  { instalacion: "EW-Quilicura", nivel: "verde", razon: "7 días estable sobre 80%" },
  { instalacion: "Scrb San Bernardo", nivel: "verde", razon: "7 días estable sobre 80%" },
  { instalacion: "Bodega Santa Amalia", nivel: "verde", razon: "7 días estable sobre 80%" },
  { instalacion: "Polpaico Quilicura", nivel: "verde", razon: "Cumplimiento sobre 80% con alertas menores" },
];

// ─── Pending alerts mock ───────────────────────────────────────────────

const mockPendingPanicos = {
  total30d: 5,
  sinResolucion: 2,
  tiempoPromedioMin: 6.2,
  peorTiempoMin: 18,
  peorInstalacion: "Metropolitan",
};

// ─── Report reliability mock ───────────────────────────────────────────

const mockReliability = {
  score: 78,
  instalacionesConProblemas: ["Embajada Brasil", "Cims", "Polpaico El Bosque"],
  rondasAfectadas: 24,
  nota: "Se detectaron 3 instalaciones con problemas reportados de conectividad de app. Las rondas no realizadas en estas instalaciones podrían no reflejar el desempeño real del guardia.",
};

// ─── KPI deltas (vs semana anterior) ───────────────────────────────────

const kpis = {
  totalRounds: 126, prevTotalRounds: 130,
  completadas: 58, prevCompletadas: 70,
  trustAvg: 43, prevTrustAvg: 58,
  criticalAlerts: 6, prevCriticalAlerts: 2,
  noRealizadas: 56, prevNoRealizadas: 42,
};

// ─── 7-day matrix mock (same as v2) ────────────────────────────────────

const last7Days = [
  { label: "Dom 9", isToday: false },
  { label: "Lun 10", isToday: false },
  { label: "Mar 11", isToday: false },
  { label: "Mié 12", isToday: false },
  { label: "Jue 13", isToday: false },
  { label: "Vie 14", isToday: false },
  { label: "Sáb 15", isToday: true },
];

type CellStatus = "ok" | "ok_alert" | "fail" | "incomplete" | "na";

interface InstHistory {
  name: string;
  horas: string[];
  grid: CellStatus[][];
  trustByDay: number[];
  alertsByDay: number[];
  cumplByDay: number[];
  trust7dAvg: number;
  trustLastTurno: number;
  alertsLastTurno: number;
  incidentes: { tipo: string; descripcion: string; guardia: string; hora: string; dia: string }[];
  tendencia: "up" | "down" | "stable";
  notaOperador?: string;
}

const mockHistories: InstHistory[] = [
  {
    name: "Fapama Quinta Normal", horas: ["22:30","23:30","00:30","01:30","02:30","03:30","04:30","05:30","06:30","07:30","08:30"],
    grid: Array.from({ length: 11 }, () => ["ok","ok","ok","ok","fail","fail","fail"] as CellStatus[]),
    trustByDay: [85,82,78,80,0,0,0], alertsByDay: [0,1,0,2,11,11,11], cumplByDay: [100,100,91,100,0,0,0],
    trust7dAvg: 46, trustLastTurno: 0, alertsLastTurno: 11, incidentes: [], tendencia: "down",
    notaOperador: "Problemas recurrentes con la app",
  },
  {
    name: "Fapama Reñaca", horas: ["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00","08:00"],
    grid: Array.from({ length: 11 }, () => ["ok","ok","ok","ok","fail","fail","fail"] as CellStatus[]),
    trustByDay: [88,85,80,82,0,0,0], alertsByDay: [0,0,1,1,11,11,11], cumplByDay: [100,100,91,100,0,0,0],
    trust7dAvg: 48, trustLastTurno: 0, alertsLastTurno: 11, incidentes: [], tendencia: "down",
  },
  {
    name: "Gard", horas: ["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00"],
    grid: Array.from({ length: 10 }, () => ["ok","ok","ok","ok","fail","fail","fail"] as CellStatus[]),
    trustByDay: [90,87,85,88,0,0,0], alertsByDay: [0,0,0,0,10,11,11], cumplByDay: [100,100,100,100,0,0,0],
    trust7dAvg: 50, trustLastTurno: 0, alertsLastTurno: 11, incidentes: [], tendencia: "down",
  },
  {
    name: "Polpaico Coronel", horas: ["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00"],
    grid: Array.from({ length: 9 }, (_, i) => ["ok","ok","ok","ok","ok",i===0?"ok":"fail",i===0?"ok":"fail"] as CellStatus[]),
    trustByDay: [88,85,90,82,87,82,9], alertsByDay: [0,0,0,0,0,0,8], cumplByDay: [100,100,100,100,100,100,11],
    trust7dAvg: 75, trustLastTurno: 9, alertsLastTurno: 8, incidentes: [], tendencia: "down",
    notaOperador: "No se reportaron rondas por mal tiempo de lluvias",
  },
  {
    name: "Condominio La Florida", horas: ["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00","08:00"],
    grid: [
      ["ok","ok","ok","ok","ok","ok","ok"],["ok","ok","ok","ok","ok","ok","ok"],
      ["ok","ok","ok","ok","fail","fail","fail"],["ok","ok","ok","fail","fail","fail","fail"],
      ["ok","ok","fail","fail","fail","fail","fail"],["ok","ok","fail","fail","fail","fail","fail"],
      ["ok","ok","fail","fail","fail","fail","fail"],["ok","fail","fail","fail","fail","fail","fail"],
      ["ok","fail","fail","fail","fail","fail","fail"],["ok","ok","fail","fail","fail","fail","fail"],
      ["ok","ok","ok","fail","fail","fail","fail"],
    ],
    trustByDay: [92,85,60,42,20,18,14], alertsByDay: [0,1,3,5,8,10,13], cumplByDay: [100,82,45,27,18,18,18],
    trust7dAvg: 47, trustLastTurno: 14, alertsLastTurno: 13, incidentes: [], tendencia: "down",
  },
  {
    name: "Cims", horas: ["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00","08:00"],
    grid: [
      ["ok","ok","ok","ok","ok","ok","ok"],["ok","ok","ok","ok","ok","ok","ok"],
      ["ok","ok","ok","ok","ok","ok","ok_alert"],["ok","ok","ok","incomplete","ok","ok","incomplete"],
      ["ok","ok","fail","ok","fail","fail","fail"],["ok","ok","fail","fail","fail","fail","fail"],
      ["ok","fail","fail","fail","fail","fail","fail"],["ok","ok","fail","fail","fail","fail","fail"],
      ["ok","ok","fail","fail","fail","fail","fail"],["ok","ok","ok","fail","fail","fail","fail"],
      ["ok","ok","ok","ok","fail","fail","fail"],
    ],
    trustByDay: [92,88,65,52,40,38,35], alertsByDay: [0,0,2,3,5,6,8], cumplByDay: [100,91,55,45,36,36,36],
    trust7dAvg: 59, trustLastTurno: 35, alertsLastTurno: 8,
    incidentes: [{ tipo: "mismo_punto_repetido", descripcion: "Marcación repetida en mismo checkpoint", guardia: "Carlos Muñoz", hora: "00:15", dia: "15-mar" }],
    tendencia: "down", notaOperador: "App presentó problemas en menor proporción",
  },
  {
    name: "Embajada Brasil", horas: ["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00"],
    grid: [
      ["ok","ok","ok","ok","ok","ok","ok"],["ok","ok","ok","ok","ok","ok","ok"],
      ["ok","ok","ok","ok","ok","ok","ok"],["ok","ok","ok","ok","ok","ok","ok_alert"],
      ["ok","ok","ok","ok","ok","fail","fail"],["ok","ok","ok","ok","fail","fail","fail"],
      ["ok","ok","ok","fail","fail","fail","fail"],["ok","ok","ok","fail","fail","fail","fail"],
      ["ok","ok","fail","fail","fail","fail","fail"],["ok","ok","fail","fail","fail","fail","fail"],
    ],
    trustByDay: [90,88,82,65,55,50,47], alertsByDay: [0,0,0,1,0,1,1], cumplByDay: [100,100,80,60,40,40,40],
    trust7dAvg: 68, trustLastTurno: 47, alertsLastTurno: 1,
    incidentes: [{ tipo: "panico", descripcion: "Botón de pánico activado", guardia: "Osvaldo Escobar", hora: "00:19", dia: "15-mar" }],
    tendencia: "down", notaOperador: "App presentó problemas",
  },
  {
    name: "Polpaico El Bosque", horas: ["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00"],
    grid: [
      ["ok","ok","ok","ok","ok","ok","ok"],["ok","ok","ok","ok","ok","ok","ok"],
      ["ok","ok","ok","ok","ok","ok","ok_alert"],["ok","ok","ok","ok","ok","ok","ok_alert"],
      ["ok","ok","ok","ok","ok","ok","ok_alert"],["ok","ok","ok","ok","ok","ok","ok_alert"],
      ["ok","ok","ok","ok","ok","ok","ok_alert"],["ok","ok","ok","ok","fail","fail","fail"],
      ["ok","ok","ok","fail","fail","fail","fail"],["ok","ok","ok","ok","ok","incomplete","incomplete"],
    ],
    trustByDay: [90,88,85,82,78,70,66], alertsByDay: [0,0,0,1,2,5,9], cumplByDay: [100,100,100,90,80,70,70],
    trust7dAvg: 80, trustLastTurno: 66, alertsLastTurno: 9, incidentes: [], tendencia: "down",
    notaOperador: "App presentó problemas en menor proporción",
  },
  {
    name: "Polpaico Quilicura", horas: ["22:00","00:00","02:00","04:00","06:00","08:00"],
    grid: [
      ["ok","ok","ok","ok","ok","ok","ok"],["ok","ok","ok","ok","ok","ok","ok"],
      ["ok","ok","ok","ok","ok","ok","ok_alert"],["ok","ok","ok","ok","ok","ok","ok_alert"],
      ["ok","ok","ok","ok","ok","ok","ok_alert"],["ok","ok","ok","ok","ok","fail","fail"],
    ],
    trustByDay: [92,90,88,85,82,78,75], alertsByDay: [0,0,0,0,2,6,12], cumplByDay: [100,100,100,100,100,83,83],
    trust7dAvg: 84, trustLastTurno: 75, alertsLastTurno: 12,
    incidentes: [{ tipo: "mismo_punto_repetido", descripcion: "Marcación repetida en mismo checkpoint", guardia: "Pedro Soto", hora: "02:30", dia: "15-mar" }],
    tendencia: "stable",
  },
  {
    name: "EW-Quilicura", horas: ["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00"],
    grid: Array.from({ length: 10 }, () => ["ok","ok","ok","ok","ok","ok","ok"] as CellStatus[]),
    trustByDay: [90,88,92,85,91,89,87], alertsByDay: [0,0,0,0,0,0,0], cumplByDay: [100,100,100,100,100,100,100],
    trust7dAvg: 89, trustLastTurno: 87, alertsLastTurno: 0, incidentes: [], tendencia: "stable",
  },
  {
    name: "Scrb San Bernardo", horas: ["22:00","00:00","02:00","04:00","06:00"],
    grid: Array.from({ length: 5 }, () => ["ok","ok","ok","ok","ok","ok","ok"] as CellStatus[]),
    trustByDay: [88,85,90,87,86,84,85], alertsByDay: [0,0,0,0,0,0,0], cumplByDay: [100,100,100,100,100,100,100],
    trust7dAvg: 86, trustLastTurno: 85, alertsLastTurno: 0, incidentes: [], tendencia: "stable",
  },
  {
    name: "Bodega Santa Amalia", horas: ["22:00","00:00","02:00","04:00","06:00","08:00","10:00"],
    grid: Array.from({ length: 7 }, () => ["ok","ok","ok","ok","ok","ok","ok"] as CellStatus[]),
    trustByDay: [88,90,85,92,87,89,87], alertsByDay: [0,0,0,0,0,0,0], cumplByDay: [100,100,100,100,100,100,100],
    trust7dAvg: 88, trustLastTurno: 87, alertsLastTurno: 0, incidentes: [], tendencia: "stable",
  },
].sort((a, b) => a.cumplByDay[6] - b.cumplByDay[6]);

// ─── Email HTML ────────────────────────────────────────────────────────

function buildEmailSemaforoSection(): string {
  const rojos = mockSemaforo.filter(s => s.nivel === "rojo");
  const amarillos = mockSemaforo.filter(s => s.nivel === "amarillo");
  if (rojos.length === 0 && amarillos.length === 0) return "";

  let html = `<tr><td style="padding:0 32px 16px">
    <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <div style="padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
        <p style="margin:0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">🚦 Requieren acción</p>
      </div><div style="padding:12px 16px">`;

  if (rojos.length > 0) {
    html += `<p style="margin:0 0 8px;font-size:11px;color:#dc2626;font-weight:700;text-transform:uppercase">🔴 ACCIÓN INMEDIATA</p>`;
    for (const r of rojos) {
      html += `<p style="margin:0 0 4px;font-size:12px;color:#1e293b"><strong>${escapeHtml(r.instalacion)}</strong> — <span style="color:#dc2626">${escapeHtml(r.razon)}</span></p>`;
    }
  }
  if (amarillos.length > 0) {
    html += `<p style="margin:${rojos.length > 0 ? "12px" : "0"} 0 8px;font-size:11px;color:#d97706;font-weight:700;text-transform:uppercase">🟡 SUPERVISAR</p>`;
    for (const a of amarillos) {
      html += `<p style="margin:0 0 4px;font-size:12px;color:#1e293b"><strong>${escapeHtml(a.instalacion)}</strong> — <span style="color:#92400e">${escapeHtml(a.razon)}</span></p>`;
    }
  }

  html += `</div></div></td></tr>`;
  return html;
}

function buildEmailReliability(): string {
  const r = mockReliability;
  const color = r.score >= 90 ? "#15803d" : r.score >= 70 ? "#d97706" : "#dc2626";
  return `<tr><td style="padding:0 32px 16px">
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-left:4px solid #0ea5e9;border-radius:6px;padding:12px 16px">
      <p style="margin:0 0 4px;font-size:11px;color:#0369a1;font-weight:600;text-transform:uppercase">Confiabilidad del reporte</p>
      <p style="margin:0;font-size:13px;color:#0c4a6e"><strong style="color:${color}">${r.score}%</strong> — ${escapeHtml(r.nota)}</p>
    </div>
  </td></tr>`;
}

function buildEmailHtml(): string {
  const k = kpis;
  const operatorComments = "LA APP UNA VEZ MAS PRESENTO PROBLEMAS EN EMBAJADA BRASIL, CIMS Y P. BOSQUE PERO EN MENOR PROPORCION. EN CORONEL NO SE REPORTARON RONDAS POR MAL TIEMPO DE LLUVIAS";

  // Build pánico block
  const panicoRows = mockPanicos.map(p => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#fef2f2;border-bottom:1px solid #7f1d1d">${escapeHtml(p.guardia)}</td>
      <td style="padding:8px 12px;font-size:13px;color:#fef2f2;border-bottom:1px solid #7f1d1d">${escapeHtml(p.instalacion)}</td>
      <td style="padding:8px 12px;font-size:13px;color:#fef2f2;border-bottom:1px solid #7f1d1d">${escapeHtml(p.hora)}</td>
      <td style="padding:8px 12px;font-size:12px;color:${p.resolucion ? "#fecaca" : "#fca5a5"};border-bottom:1px solid #7f1d1d">${p.resolucion ? escapeHtml(p.resolucion) : "⚠️ SIN RESOLUCIÓN"}</td>
    </tr>`).join("");

  const panicoBlock = mockPanicos.length > 0 ? `<tr><td style="padding:0 32px 16px">
    <div style="background:#991b1b;border:2px solid #dc2626;border-radius:8px;overflow:hidden">
      <div style="padding:12px 16px;background:#7f1d1d">
        <p style="margin:0;font-size:14px;font-weight:700;color:#ffffff">🚨 ALERTAS DE PÁNICO (${mockPanicos.length})</p>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <thead><tr style="background:#7f1d1d">
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#fca5a5;font-weight:600">Guardia</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#fca5a5;font-weight:600">Instalación</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#fca5a5;font-weight:600">Hora</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#fca5a5;font-weight:600">Resolución</th>
        </tr></thead>
        <tbody>${panicoRows}</tbody>
      </table>
    </div>
  </td></tr>` : "";

  // Pending panics summary
  const pp = mockPendingPanicos;
  const pendingPanicBlock = `<tr><td style="padding:0 32px 16px">
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 16px">
      <p style="margin:0;font-size:11px;color:#991b1b;font-weight:600">⏱️ Pánicos últimos 30 días: ${pp.total30d} total · <strong style="color:#dc2626">${pp.sinResolucion} sin resolución</strong> · Tiempo promedio respuesta: ${pp.tiempoPromedioMin} min · Peor: ${pp.peorTiempoMin} min (${escapeHtml(pp.peorInstalacion)})</p>
    </div>
  </td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

  <!-- Header -->
  <tr><td style="background:#0f172a;padding:28px 32px">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:600">Reporte de Turno</p>
    <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#fff">Monitoreo de Rondas</p>
    <p style="margin:8px 0 0;font-size:13px;color:#94a3b8">14 mar 2026, 10:27 p.m. — 15 mar 2026, 12:02 p.m.</p>
    <p style="margin:4px 0 0;font-size:13px;color:#cbd5e1">Operador: <strong style="color:#fff">central@gard.cl</strong></p>
  </td></tr>

  ${panicoBlock}
  ${pendingPanicBlock}

  <!-- KPIs with deltas -->
  <tr><td style="padding:16px 32px 8px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
      <tr>
        <td style="padding:14px;text-align:center;background:#f8fafc;border-right:1px solid #e2e8f0;width:25%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#1e293b">${k.completadas}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#64748b">Completadas</p>
          <p style="margin:2px 0 0;font-size:10px">${deltaArrow(k.completadas - k.prevCompletadas)} vs sem. ant.</p>
        </td>
        <td style="padding:14px;text-align:center;background:#fef2f2;border-right:1px solid #e2e8f0;width:25%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#dc2626">${k.noRealizadas}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#dc2626">No realizadas</p>
          <p style="margin:2px 0 0;font-size:10px">${deltaArrow(-(k.noRealizadas - k.prevNoRealizadas))} vs sem. ant.</p>
        </td>
        <td style="padding:14px;text-align:center;background:${k.trustAvg<60?"#fef2f2":"#f8fafc"};border-right:1px solid #e2e8f0;width:25%">
          <p style="margin:0;font-size:28px;font-weight:700;color:${trustColor(k.trustAvg)}">${k.trustAvg}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#64748b">Trust Avg</p>
          <p style="margin:2px 0 0;font-size:10px">${deltaArrow(k.trustAvg - k.prevTrustAvg)} vs sem. ant.</p>
        </td>
        <td style="padding:14px;text-align:center;background:#fef2f2;width:25%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#dc2626">${k.criticalAlerts}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#dc2626">Alertas Críticas</p>
          <p style="margin:2px 0 0;font-size:10px">${deltaArrow(-(k.criticalAlerts - k.prevCriticalAlerts))} vs sem. ant.</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Semáforo -->
  ${buildEmailSemaforoSection()}

  <!-- Reliability -->
  ${buildEmailReliability()}

  <!-- Operator comments -->
  <tr><td style="padding:0 32px 16px">
    <div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:6px;padding:12px 16px">
      <p style="margin:0 0 4px;font-size:11px;color:#92400e;font-weight:600;text-transform:uppercase">Comentarios del operador</p>
      <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5">${escapeHtml(operatorComments)}</p>
    </div>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:8px 32px 12px" align="center">
    <a href="https://opai.gard.cl/ops/rondas/monitor" target="_blank" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:12px 24px;border-radius:8px">Ver en OPAI</a>
  </td></tr>
  <tr><td style="padding:0 32px 24px" align="center">
    <p style="margin:0;font-size:12px;color:#94a3b8">PDF con detalle completo adjunto (matriz 7 días + ranking guardias)</p>
  </td></tr>

  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;background:#f8fafc">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center">Sistema OPAI — Reporte generado automáticamente</p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

// ─── PDF HTML ──────────────────────────────────────────────────────────

function cellBg(s: CellStatus): string {
  return { ok: "#dcfce7", ok_alert: "#fef9c3", incomplete: "#fed7aa", fail: "#fee2e2", na: "#f1f5f9" }[s];
}
function cellIcon(s: CellStatus): string {
  return {
    ok: '<span style="color:#15803d;font-weight:700">✓</span>',
    ok_alert: '<span style="color:#d97706;font-weight:700">✓!</span>',
    incomplete: '<span style="color:#ea580c;font-weight:700">~</span>',
    fail: '<span style="color:#dc2626;font-weight:700">✗</span>',
    na: '<span style="color:#94a3b8">—</span>',
  }[s];
}
function tendLabel(t: "up"|"down"|"stable"): string {
  return { up: '<span style="color:#15803d;font-weight:700">↑ Mejorando</span>', down: '<span style="color:#dc2626;font-weight:700">↓ Empeorando</span>', stable: '<span style="color:#15803d;font-weight:700">→ Estable</span>' }[t];
}

function buildPdfHtml(): string {
  const k = kpis;

  // ─── Page: Cover ──────
  const cover = `
  <div style="padding:50px 40px;text-align:center">
    <div style="background:#0f172a;border-radius:12px;padding:36px;margin-bottom:28px">
      <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px">Gard Security</p>
      <h1 style="margin:10px 0 0;font-size:26px;color:#fff">Reporte de Turno</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#94a3b8">Monitoreo de Rondas — Semana Móvil (09 - 15 mar 2026)</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;text-align:left">
      <tr><td style="padding:6px 0;font-size:12px;color:#64748b;width:140px">Operador</td><td style="padding:6px 0;font-size:12px;color:#1e293b;font-weight:500">central@gard.cl</td></tr>
      <tr><td style="padding:6px 0;font-size:12px;color:#64748b">Último turno</td><td style="padding:6px 0;font-size:12px;color:#1e293b;font-weight:500">14 mar 10:27 p.m. — 15 mar 12:02 p.m.</td></tr>
    </table>

    <!-- KPIs with deltas -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px">
      <tr>
        <td style="padding:16px;text-align:center;background:#f0fdf4;border-right:1px solid #e2e8f0;width:20%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#15803d">${k.completadas}</p>
          <p style="margin:2px 0 0;font-size:10px;color:#15803d">Completadas</p>
          <p style="margin:2px 0 0;font-size:9px">${deltaArrow(k.completadas - k.prevCompletadas)} vs sem. ant.</p>
        </td>
        <td style="padding:16px;text-align:center;background:#fef2f2;border-right:1px solid #e2e8f0;width:20%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#dc2626">${k.noRealizadas}</p>
          <p style="margin:2px 0 0;font-size:10px;color:#dc2626">No realizadas</p>
          <p style="margin:2px 0 0;font-size:9px">${deltaArrow(-(k.noRealizadas - k.prevNoRealizadas))} vs sem. ant.</p>
        </td>
        <td style="padding:16px;text-align:center;background:#fef2f2;border-right:1px solid #e2e8f0;width:20%">
          <p style="margin:0;font-size:28px;font-weight:700;color:${trustColor(k.trustAvg)}">${k.trustAvg}</p>
          <p style="margin:2px 0 0;font-size:10px;color:#64748b">Trust Avg</p>
          <p style="margin:2px 0 0;font-size:9px">${deltaArrow(k.trustAvg - k.prevTrustAvg)} vs sem. ant.</p>
        </td>
        <td style="padding:16px;text-align:center;background:#fef2f2;border-right:1px solid #e2e8f0;width:20%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#dc2626">${k.criticalAlerts}</p>
          <p style="margin:2px 0 0;font-size:10px;color:#dc2626">Alertas Críticas</p>
          <p style="margin:2px 0 0;font-size:9px">${deltaArrow(-(k.criticalAlerts - k.prevCriticalAlerts))} vs sem. ant.</p>
        </td>
        <td style="padding:16px;text-align:center;background:#f0f9ff;width:20%">
          <p style="margin:0;font-size:28px;font-weight:700;color:${mockReliability.score >= 90 ? "#15803d" : mockReliability.score >= 70 ? "#0369a1" : "#dc2626"}">${mockReliability.score}%</p>
          <p style="margin:2px 0 0;font-size:10px;color:#0369a1">Confiabilidad</p>
        </td>
      </tr>
    </table>

    <!-- Reliability note -->
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-left:4px solid #0ea5e9;border-radius:6px;padding:10px 14px;text-align:left;margin-bottom:16px">
      <p style="margin:0;font-size:11px;color:#0c4a6e">${escapeHtml(mockReliability.nota)}</p>
      <p style="margin:4px 0 0;font-size:10px;color:#0369a1">Instalaciones afectadas: ${mockReliability.instalacionesConProblemas.map(n => `<strong>${escapeHtml(n)}</strong>`).join(", ")} (${mockReliability.rondasAfectadas} rondas)</p>
    </div>

    <!-- Operator comments -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:6px;padding:10px 14px;text-align:left;margin-bottom:16px">
      <p style="margin:0 0 4px;font-size:10px;color:#92400e;font-weight:600;text-transform:uppercase">Comentarios del operador (último turno)</p>
      <p style="margin:0;font-size:11px;color:#78350f;line-height:1.4">LA APP UNA VEZ MAS PRESENTO PROBLEMAS EN EMBAJADA BRASIL, CIMS Y P. BOSQUE PERO EN MENOR PROPORCION. EN CORONEL NO SE REPORTARON RONDAS POR MAL TIEMPO DE LLUVIAS</p>
    </div>

    <!-- Legend -->
    <div style="text-align:left">
      <p style="margin:0 0 4px;font-size:9px;color:#94a3b8;font-weight:600;text-transform:uppercase">Leyenda de matriz</p>
      <span style="display:inline-block;background:#dcfce7;padding:2px 6px;border-radius:3px;font-size:9px;color:#15803d;font-weight:700;margin-right:6px">✓ OK</span>
      <span style="display:inline-block;background:#fef9c3;padding:2px 6px;border-radius:3px;font-size:9px;color:#d97706;font-weight:700;margin-right:6px">✓! Con alerta</span>
      <span style="display:inline-block;background:#fed7aa;padding:2px 6px;border-radius:3px;font-size:9px;color:#ea580c;font-weight:700;margin-right:6px">~ Incompleta</span>
      <span style="display:inline-block;background:#fee2e2;padding:2px 6px;border-radius:3px;font-size:9px;color:#dc2626;font-weight:700">✗ No realizada</span>
    </div>
  </div>`;

  // ─── Page: Semáforo ──────
  const rojos = mockSemaforo.filter(s => s.nivel === "rojo");
  const amarillos = mockSemaforo.filter(s => s.nivel === "amarillo");
  const verdes = mockSemaforo.filter(s => s.nivel === "verde");

  function semaforoRow(item: SemaforoItem, bg: string, dotColor: string): string {
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dotColor};margin-right:6px;vertical-align:middle"></span><strong>${escapeHtml(item.instalacion)}</strong></td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#334155">${escapeHtml(item.razon)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#64748b;font-style:italic">${item.notaOperador ? escapeHtml(item.notaOperador) : "—"}</td>
    </tr>`;
  }

  const semaforoPage = `
  <div style="page-break-before:always;padding:30px 40px">
    <h2 style="margin:0 0 16px;font-size:16px;color:#1e293b">🚦 Semáforo de Acción</h2>

    ${rojos.length > 0 ? `
    <div style="margin-bottom:16px;border:2px solid #dc2626;border-radius:8px;overflow:hidden">
      <div style="background:#dc2626;padding:8px 16px"><p style="margin:0;font-size:12px;color:#fff;font-weight:700">🔴 ACCIÓN INMEDIATA — ${rojos.length} instalaciones</p></div>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px">
        <thead><tr style="background:#fef2f2">
          <th style="padding:6px 12px;text-align:left;color:#991b1b;font-weight:600">Instalación</th>
          <th style="padding:6px 12px;text-align:left;color:#991b1b;font-weight:600">Motivo</th>
          <th style="padding:6px 12px;text-align:left;color:#991b1b;font-weight:600">Nota operador</th>
        </tr></thead>
        <tbody>${rojos.map(r => semaforoRow(r, "#fef2f2", "#dc2626")).join("")}</tbody>
      </table>
    </div>` : ""}

    ${amarillos.length > 0 ? `
    <div style="margin-bottom:16px;border:2px solid #f59e0b;border-radius:8px;overflow:hidden">
      <div style="background:#f59e0b;padding:8px 16px"><p style="margin:0;font-size:12px;color:#fff;font-weight:700">🟡 SUPERVISAR — ${amarillos.length} instalaciones</p></div>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px">
        <thead><tr style="background:#fffbeb">
          <th style="padding:6px 12px;text-align:left;color:#92400e;font-weight:600">Instalación</th>
          <th style="padding:6px 12px;text-align:left;color:#92400e;font-weight:600">Motivo</th>
          <th style="padding:6px 12px;text-align:left;color:#92400e;font-weight:600">Nota operador</th>
        </tr></thead>
        <tbody>${amarillos.map(a => semaforoRow(a, "#fffbeb", "#f59e0b")).join("")}</tbody>
      </table>
    </div>` : ""}

    ${verdes.length > 0 ? `
    <div style="border:1px solid #bbf7d0;border-radius:8px;overflow:hidden">
      <div style="background:#22c55e;padding:8px 16px"><p style="margin:0;font-size:12px;color:#fff;font-weight:700">🟢 OK — ${verdes.length} instalaciones</p></div>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px">
        <tbody>${verdes.map(v => `<tr><td style="padding:6px 12px;border-bottom:1px solid #f0fdf4"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;margin-right:6px;vertical-align:middle"></span>${escapeHtml(v.instalacion)}</td><td style="padding:6px 12px;border-bottom:1px solid #f0fdf4;font-size:11px;color:#64748b">${escapeHtml(v.razon)}</td></tr>`).join("")}</tbody>
      </table>
    </div>` : ""}
  </div>`;

  // ─── Page: Pánico ──────
  const panicoPage = mockPanicos.length > 0 ? `
  <div style="page-break-before:always;padding:30px 40px">
    <div style="background:#991b1b;border-radius:8px;padding:14px 20px;margin-bottom:16px">
      <h2 style="margin:0;color:#fff;font-size:15px">🚨 Alertas de Pánico</h2>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:12px;margin-bottom:16px">
      <thead><tr style="background:#fef2f2">
        <th style="padding:8px 12px;text-align:left;color:#991b1b;font-weight:600;border-bottom:2px solid #fecaca">Guardia</th>
        <th style="padding:8px 12px;text-align:left;color:#991b1b;font-weight:600;border-bottom:2px solid #fecaca">Instalación</th>
        <th style="padding:8px 12px;text-align:left;color:#991b1b;font-weight:600;border-bottom:2px solid #fecaca">Hora</th>
        <th style="padding:8px 12px;text-align:left;color:#991b1b;font-weight:600;border-bottom:2px solid #fecaca">Resolución</th>
        <th style="padding:8px 12px;text-align:left;color:#991b1b;font-weight:600;border-bottom:2px solid #fecaca">Tiempo resp.</th>
      </tr></thead>
      <tbody>${mockPanicos.map(p => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${escapeHtml(p.guardia)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:500">${escapeHtml(p.instalacion)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${escapeHtml(p.hora)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:${p.resolucion?"#334155":"#dc2626"};font-weight:${p.resolucion?"normal":"600"}">${p.resolucion ? escapeHtml(p.resolucion) : "⚠️ SIN RESOLUCIÓN"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:${p.tiempoRespuestaMin !== null ? (p.tiempoRespuestaMin <= 5 ? "#15803d" : "#d97706") : "#dc2626"}">${p.tiempoRespuestaMin !== null ? p.tiempoRespuestaMin + " min" : "—"}</td>
      </tr>`).join("")}</tbody>
    </table>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 14px">
      <p style="margin:0;font-size:11px;color:#991b1b;font-weight:600">Estadísticas de pánico (30 días): ${mockPendingPanicos.total30d} alertas · ${mockPendingPanicos.sinResolucion} sin resolución · Tiempo promedio: ${mockPendingPanicos.tiempoPromedioMin} min · Peor: ${mockPendingPanicos.peorTiempoMin} min (${escapeHtml(mockPendingPanicos.peorInstalacion)})</p>
    </div>
  </div>` : "";

  // ─── Page: Guard Ranking ──────
  const sortedGuards = [...mockGuardRanking].sort((a, b) => a.cumpl - b.cumpl);
  const guardPage = `
  <div style="page-break-before:always;padding:30px 40px">
    <h2 style="margin:0 0 16px;font-size:16px;color:#1e293b">👤 Ranking de Guardias (7 días)</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:12px">
      <thead><tr style="background:#f8fafc">
        <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Guardia</th>
        <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Instalación</th>
        <th style="padding:8px 12px;text-align:center;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Rondas 7d</th>
        <th style="padding:8px 12px;text-align:center;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Cumpl.</th>
        <th style="padding:8px 12px;text-align:center;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Trust</th>
        <th style="padding:8px 12px;text-align:center;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Incid.</th>
        <th style="padding:8px 12px;text-align:center;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Tend.</th>
      </tr></thead>
      <tbody>${sortedGuards.map(g => {
        const cColor = g.cumpl >= 80 ? "#15803d" : g.cumpl >= 60 ? "#d97706" : "#dc2626";
        const tIcon = g.tendencia === "up" ? '<span style="color:#15803d">↑</span>' : g.tendencia === "down" ? '<span style="color:#dc2626">↓</span>' : '<span style="color:#15803d">→</span>';
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:500">${escapeHtml(g.nombre)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${escapeHtml(g.instalacion)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${g.rondas7d}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:700;color:${cColor}">${g.cumpl}%</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;color:${trustColor(g.trustAvg)};font-weight:600">${g.trustAvg}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;color:${g.incidentes > 0 ? "#dc2626" : "#64748b"}">${g.incidentes || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:700">${tIcon}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>
  </div>`;

  // ─── Pages: Installation 7-day matrix ──────
  const instPages = mockHistories.map(inst => {
    const dayHeaders = last7Days.map(d =>
      `<th style="padding:5px 3px;text-align:center;font-size:8px;color:${d.isToday?"#0f172a":"#94a3b8"};font-weight:${d.isToday?"700":"600"};background:${d.isToday?"#e0f2fe":"#f8fafc"};border-bottom:2px solid ${d.isToday?"#0ea5e9":"#e2e8f0"};min-width:48px">${escapeHtml(d.label)}</th>`
    ).join("");

    const gridRows = inst.horas.map((hora, hi) => {
      const cells = last7Days.map((_, di) => {
        const s = inst.grid[hi]?.[di] ?? "na";
        return `<td style="padding:3px;text-align:center;background:${cellBg(s)};border-bottom:1px solid #f1f5f9">${cellIcon(s)}</td>`;
      }).join("");
      return `<tr><td style="padding:3px 6px;font-size:10px;color:#64748b;font-weight:500;border-bottom:1px solid #f1f5f9;white-space:nowrap">${hora}</td>${cells}</tr>`;
    }).join("");

    const summaryRows = [
      { label: "Trust", values: inst.trustByDay, fmt: (v: number) => ({ text: v > 0 ? String(v) : "—", color: v > 0 ? trustColor(v) : "#cbd5e1" }) },
      { label: "Alertas", values: inst.alertsByDay, fmt: (v: number) => ({ text: v > 0 ? String(v) : "—", color: v > 0 ? "#dc2626" : "#cbd5e1" }) },
      { label: "Cumpl.", values: inst.cumplByDay, fmt: (v: number) => ({ text: v + "%", color: v >= 80 ? "#15803d" : v >= 60 ? "#d97706" : "#dc2626" }) },
    ].map(row => `<tr>
      <td style="padding:4px 6px;font-size:9px;color:#64748b;font-weight:600;background:#f8fafc">${row.label}</td>
      ${last7Days.map((d, di) => { const f = row.fmt(row.values[di]); return `<td style="padding:3px;text-align:center;font-size:9px;font-weight:700;color:${f.color};background:${d.isToday?"#e0f2fe":"#fff"};border-bottom:1px solid #e2e8f0">${f.text}</td>`; }).join("")}
    </tr>`).join("");

    const incHtml = inst.incidentes.length > 0 ? inst.incidentes.map(inc =>
      `<div style="background:#fefce8;border-left:3px solid #f59e0b;padding:4px 8px;margin-top:4px;font-size:10px;color:#78350f"><strong>${escapeHtml(inc.tipo)}</strong> — ${escapeHtml(inc.descripcion)} (${escapeHtml(inc.guardia)}, ${escapeHtml(inc.dia)} ${escapeHtml(inc.hora)})</div>`
    ).join("") : "";

    const notaHtml = inst.notaOperador ? `<div style="background:#f0f9ff;border-left:3px solid #0ea5e9;padding:4px 8px;margin-top:4px;font-size:10px;color:#0c4a6e">💬 <strong>Operador:</strong> ${escapeHtml(inst.notaOperador)}</div>` : "";

    return `
    <div style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;page-break-inside:avoid">
      <div style="background:#f8fafc;padding:10px 14px;border-bottom:1px solid #e2e8f0">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:13px;font-weight:700;color:#1e293b">${escapeHtml(inst.name)}</td>
          <td style="text-align:right;font-size:11px">
            <span style="color:#64748b;margin-right:14px">Trust 7d: <strong style="color:${trustColor(inst.trust7dAvg)}">${inst.trust7dAvg}</strong></span>
            <span style="color:#64748b;margin-right:14px">Último: <strong style="color:${trustColor(inst.trustLastTurno)}">${inst.trustLastTurno}</strong></span>
            ${inst.alertsLastTurno > 0 ? `<span style="color:#dc2626;font-weight:600;margin-right:14px">${inst.alertsLastTurno} alertas</span>` : ""}
            ${tendLabel(inst.tendencia)}
          </td>
        </tr></table>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:11px">
        <thead><tr><th style="padding:5px 6px;text-align:left;font-size:9px;color:#94a3b8;font-weight:600;background:#f8fafc;border-bottom:2px solid #e2e8f0;width:50px">Hora</th>${dayHeaders}</tr></thead>
        <tbody>
          ${gridRows}
          <tr style="border-top:2px solid #e2e8f0"><td colspan="${last7Days.length + 1}" style="height:2px;background:#e2e8f0"></td></tr>
          ${summaryRows}
        </tbody>
      </table>
      ${incHtml || notaHtml ? `<div style="padding:6px 14px 8px">${incHtml}${notaHtml}</div>` : ""}
    </div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; font-size: 12px; }
    @page { margin: 15mm 12mm; size: A4 landscape; }
    table { border-collapse: collapse; }
  </style>
  </head><body>
    ${cover}
    ${semaforoPage}
    ${panicoPage}
    ${guardPage}
    <div style="page-break-before:always;padding:30px">
      <h2 style="margin:0 0 4px;font-size:16px;color:#1e293b">📊 Detalle por Instalación — Semana Móvil</h2>
      <p style="margin:0 0 16px;font-size:10px;color:#94a3b8">Ordenado por cumplimiento del último turno (menor a mayor). Columna destacada en azul = último turno.</p>
      ${instPages}
    </div>
    <div style="padding:16px 40px;text-align:center;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:9px;color:#94a3b8">Sistema OPAI — Reporte generado automáticamente — ${new Date().toLocaleDateString("es-CL")}</p>
    </div>
  </body></html>`;
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const toEmail = process.argv[2] || "carlos.irigoyen@gmail.com";
  if (!process.env.RESEND_API_KEY) { console.error("RESEND_API_KEY not found"); process.exit(1); }

  const resend = new Resend(process.env.RESEND_API_KEY);

  console.log("Building email HTML...");
  const emailHtml = buildEmailHtml();

  console.log("Building PDF HTML...");
  const pdfHtml = buildPdfHtml();

  console.log("Generating PDF...");
  let pdfBuffer: Buffer;
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    const page = await browser.newPage();
    await page.setContent(pdfHtml, { waitUntil: "networkidle" });
    pdfBuffer = Buffer.from(await page.pdf({ format: "A4", landscape: true, printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } }));
    await browser.close();
    console.log(`PDF: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error("Playwright error, sending without PDF:", err);
    pdfBuffer = Buffer.alloc(0);
  }

  console.log(`Sending to ${toEmail}...`);
  const response = await resend.emails.send({
    from: FROM, to: [toEmail],
    subject: "📋 Reporte Turno 14 mar — central@gard.cl [V3 COMPLETO]",
    html: emailHtml,
    attachments: pdfBuffer.length > 0 ? [{ filename: "Reporte-Turno-Semana-14-mar-2026.pdf", content: pdfBuffer }] : [],
    tags: [{ name: "type", value: "test_turno_v3" }],
  });

  if (response.error) { console.error("Error:", response.error); process.exit(1); }
  console.log(`Sent! ID: ${response.data?.id}`);
}

main().catch(console.error);
