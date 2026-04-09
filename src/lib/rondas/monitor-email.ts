/**
 * Email de resumen de turno de monitoreo (v2).
 *
 * Se envía al cerrar un turno con:
 *   - Email: pánico destacado, KPIs con deltas, semáforo, confiabilidad
 *   - PDF adjunto: matriz 7 días, ranking guardias, detalle por instalación
 */

import { resend } from "@/lib/resend";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import type { MonitorTurnoPdfData } from "./monitor-turno-pdf";

// ─── Types ─────────────────────────────────────────────────────────────

export interface PanicoEmailDetail {
  guardia: string;
  instalacion: string;
  hora: string;
  resolucion: string | null;
  tiempoRespuestaMin: number | null;
}

export interface SemaforoItem {
  instalacion: string;
  nivel: "rojo" | "amarillo" | "verde";
  razon: string;
}

export interface InstallationSummary {
  name: string;
  totalRondas: number;
  completadas: number;
  alertCount: number;
  trustAvg: number;
  cumplimiento: number;
}

export interface IncidenteGuardiaEmail {
  guardia: string;
  instalacion: string;
  tipo: string;
  descripcion: string;
  fecha: string;
}

export interface MonitorEmailData {
  turnoId: string;
  tenantId: string;
  operatorName: string;
  startedAt: Date;
  endedAt: Date;
  totalRounds: number;
  completadas: number;
  incompletas: number;
  noRealizadas: number;
  trustAvg: number;
  totalAlerts: number;
  criticalAlerts: number;
  resolvedAlerts: number;
  unresolvedAlerts: number;
  operatorComments?: string | null;
  aiSummary: string;
  baseUrl: string;
  // v2 additions
  panicos?: PanicoEmailDetail[];
  panicoStats30d?: { total: number; sinResolucion: number; tiempoPromedioMin: number; peorTiempoMin: number; peorInstalacion: string };
  deltaCompletadas?: number;
  deltaNoRealizadas?: number;
  deltaTrustAvg?: number;
  deltaCriticalAlerts?: number;
  semaforo?: SemaforoItem[];
  reliability?: { score: number; nota: string };
  installationSummaries?: InstallationSummary[];
  incidentesDelGuardia?: IncidenteGuardiaEmail[];
  // PDF data (if provided, PDF is generated and attached)
  pdfData?: MonitorTurnoPdfData;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDt(d: Date): string {
  return d.toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function tc(score: number): string {
  if (score >= 80) return "#15803d";
  if (score >= 60) return "#d97706";
  return "#dc2626";
}

function delta(val: number | undefined): string {
  if (val === undefined) return "";
  if (val > 0) return `<span style="color:#15803d;font-weight:600">↑ +${val}</span>`;
  if (val < 0) return `<span style="color:#dc2626;font-weight:600">↓ ${val}</span>`;
  return `<span style="color:#64748b">=</span>`;
}

// ─── Email HTML ────────────────────────────────────────────────────────

function buildPanicoBlock(panicos: PanicoEmailDetail[]): string {
  if (!panicos || panicos.length === 0) return "";
  const rows = panicos.map(p => `<tr>
    <td style="padding:8px 12px;font-size:13px;color:#fef2f2;border-bottom:1px solid #7f1d1d">${esc(p.guardia)}</td>
    <td style="padding:8px 12px;font-size:13px;color:#fef2f2;border-bottom:1px solid #7f1d1d">${esc(p.instalacion)}</td>
    <td style="padding:8px 12px;font-size:13px;color:#fef2f2;border-bottom:1px solid #7f1d1d">${esc(p.hora)}</td>
    <td style="padding:8px 12px;font-size:12px;color:${p.resolucion ? "#fecaca" : "#fca5a5"};border-bottom:1px solid #7f1d1d">${p.resolucion ? esc(p.resolucion) : "⚠️ SIN RESOLUCIÓN"}</td>
  </tr>`).join("");

  return `<tr><td style="padding:0 32px 16px">
    <div style="background:#991b1b;border:2px solid #dc2626;border-radius:8px;overflow:hidden">
      <div style="padding:12px 16px;background:#7f1d1d">
        <p style="margin:0;font-size:14px;font-weight:700;color:#ffffff">🚨 ALERTAS DE PÁNICO (${panicos.length})</p>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <thead><tr style="background:#7f1d1d">
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#fca5a5;font-weight:600">Guardia</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#fca5a5;font-weight:600">Instalación</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#fca5a5;font-weight:600">Hora</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#fca5a5;font-weight:600">Resolución</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </td></tr>`;
}

function buildPanicStats(stats: MonitorEmailData["panicoStats30d"]): string {
  if (!stats) return "";
  return `<tr><td style="padding:0 32px 16px">
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 16px">
      <p style="margin:0;font-size:11px;color:#991b1b;font-weight:600">⏱️ Pánicos 30 días: ${stats.total} total · <strong style="color:#dc2626">${stats.sinResolucion} sin resolución</strong> · Tiempo promedio: ${stats.tiempoPromedioMin} min · Peor: ${stats.peorTiempoMin} min (${esc(stats.peorInstalacion)})</p>
    </div>
  </td></tr>`;
}

function buildSemaforoBlock(semaforo: SemaforoItem[] | undefined): string {
  if (!semaforo || semaforo.length === 0) return "";
  const rojos = semaforo.filter(s => s.nivel === "rojo");
  const amarillos = semaforo.filter(s => s.nivel === "amarillo");
  if (rojos.length === 0 && amarillos.length === 0) return "";

  let inner = "";
  if (rojos.length > 0) {
    inner += `<p style="margin:0 0 8px;font-size:11px;color:#dc2626;font-weight:700;text-transform:uppercase">🔴 ACCIÓN INMEDIATA</p>`;
    for (const r of rojos) inner += `<p style="margin:0 0 4px;font-size:12px;color:#1e293b"><strong>${esc(r.instalacion)}</strong> — <span style="color:#dc2626">${esc(r.razon)}</span></p>`;
  }
  if (amarillos.length > 0) {
    inner += `<p style="margin:${rojos.length > 0 ? "12px" : "0"} 0 8px;font-size:11px;color:#d97706;font-weight:700;text-transform:uppercase">🟡 SUPERVISAR</p>`;
    for (const a of amarillos) inner += `<p style="margin:0 0 4px;font-size:12px;color:#1e293b"><strong>${esc(a.instalacion)}</strong> — <span style="color:#92400e">${esc(a.razon)}</span></p>`;
  }

  return `<tr><td style="padding:0 32px 16px">
    <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <div style="padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
        <p style="margin:0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">🚦 Requieren acción</p>
      </div>
      <div style="padding:12px 16px">${inner}</div>
    </div>
  </td></tr>`;
}

function buildReliabilityBlock(rel: MonitorEmailData["reliability"]): string {
  if (!rel) return "";
  const color = rel.score >= 90 ? "#15803d" : rel.score >= 70 ? "#d97706" : "#dc2626";
  return `<tr><td style="padding:0 32px 16px">
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-left:4px solid #0ea5e9;border-radius:6px;padding:12px 16px">
      <p style="margin:0 0 4px;font-size:11px;color:#0369a1;font-weight:600;text-transform:uppercase">Confiabilidad del reporte</p>
      <p style="margin:0;font-size:13px;color:#0c4a6e"><strong style="color:${color}">${rel.score}%</strong> — ${esc(rel.nota)}</p>
    </div>
  </td></tr>`;
}

function buildTop5(summaries: InstallationSummary[] | undefined): string {
  if (!summaries || summaries.length === 0) return "";
  const worst = [...summaries].sort((a, b) => a.cumplimiento - b.cumplimiento).filter(i => i.totalRondas > 0).slice(0, 5);
  if (worst.length === 0) return "";

  const rows = worst.map(inst => {
    const pct = inst.cumplimiento;
    const barColor = pct >= 80 ? "#22c55e" : pct >= 60 ? "#eab308" : "#ef4444";
    return `<tr>
      <td style="padding:8px 12px;font-size:13px;color:#1e293b;font-weight:500;border-bottom:1px solid #f1f5f9">${esc(inst.name)}</td>
      <td style="padding:8px 12px;font-size:13px;color:#64748b;text-align:center;border-bottom:1px solid #f1f5f9">${inst.completadas}/${inst.totalRondas}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">
        <div style="background:#f1f5f9;border-radius:4px;height:8px;width:100%"><div style="background:${barColor};border-radius:4px;height:8px;width:${Math.max(pct, 3)}%"></div></div>
        <span style="font-size:11px;color:${barColor};font-weight:600">${pct}%</span>
      </td>
      <td style="padding:8px 12px;font-size:13px;color:${tc(inst.trustAvg)};text-align:center;font-weight:600;border-bottom:1px solid #f1f5f9">${inst.trustAvg}</td>
      <td style="padding:8px 12px;font-size:12px;color:${inst.alertCount > 0 ? "#dc2626" : "#64748b"};text-align:center;border-bottom:1px solid #f1f5f9">${inst.alertCount > 0 ? inst.alertCount : "—"}</td>
    </tr>`;
  }).join("");

  return `<tr><td style="padding:0 32px 16px">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <div style="padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
        <p style="margin:0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Instalaciones con menor cumplimiento</p>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <thead><tr style="background:#f8fafc">
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600">Instalación</th>
          <th style="padding:6px 12px;text-align:center;font-size:11px;color:#94a3b8;font-weight:600">Rondas</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#94a3b8;font-weight:600;width:120px">Cumplimiento</th>
          <th style="padding:6px 12px;text-align:center;font-size:11px;color:#94a3b8;font-weight:600">Trust</th>
          <th style="padding:6px 12px;text-align:center;font-size:11px;color:#94a3b8;font-weight:600">Alertas</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </td></tr>`;
}

function buildHtml(data: MonitorEmailData): string {
  const baseUrl = data.baseUrl.replace(/\/+$/, "");
  const monitorUrl = `${baseUrl}/ops/rondas/monitor`;
  const hasPdf = !!data.pdfData;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

  <!-- Header -->
  <tr><td style="background:#0f172a;padding:28px 32px">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:600">Reporte de Turno</p>
    <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#fff">Monitoreo de Rondas</p>
    <p style="margin:8px 0 0;font-size:13px;color:#94a3b8">${fmtDt(data.startedAt)} — ${fmtDt(data.endedAt)}</p>
    <p style="margin:4px 0 0;font-size:13px;color:#cbd5e1">Operador: <strong style="color:#fff">${esc(data.operatorName)}</strong></p>
  </td></tr>

  ${buildPanicoBlock(data.panicos ?? [])}
  ${buildPanicStats(data.panicoStats30d)}

  <!-- KPIs with deltas -->
  <tr><td style="padding:16px 32px 8px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
      <tr>
        <td style="padding:14px;text-align:center;background:#f0fdf4;border-right:1px solid #e2e8f0;width:25%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#15803d">${data.completadas}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#15803d">Completadas</p>
          ${data.deltaCompletadas !== undefined ? `<p style="margin:2px 0 0;font-size:10px">${delta(data.deltaCompletadas)} vs sem. ant.</p>` : ""}
        </td>
        <td style="padding:14px;text-align:center;background:#fef2f2;border-right:1px solid #e2e8f0;width:25%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#dc2626">${data.noRealizadas}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#dc2626">No realizadas</p>
          ${data.deltaNoRealizadas !== undefined ? `<p style="margin:2px 0 0;font-size:10px">${delta(-data.deltaNoRealizadas)} vs sem. ant.</p>` : ""}
        </td>
        <td style="padding:14px;text-align:center;background:${data.trustAvg < 60 ? "#fef2f2" : "#f8fafc"};border-right:1px solid #e2e8f0;width:25%">
          <p style="margin:0;font-size:28px;font-weight:700;color:${tc(data.trustAvg)}">${data.trustAvg}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#64748b">Trust Avg</p>
          ${data.deltaTrustAvg !== undefined ? `<p style="margin:2px 0 0;font-size:10px">${delta(data.deltaTrustAvg)} vs sem. ant.</p>` : ""}
        </td>
        <td style="padding:14px;text-align:center;background:#fef2f2;width:25%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#dc2626">${data.criticalAlerts}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#dc2626">Alertas Críticas</p>
          ${data.deltaCriticalAlerts !== undefined ? `<p style="margin:2px 0 0;font-size:10px">${delta(-data.deltaCriticalAlerts)} vs sem. ant.</p>` : ""}
        </td>
      </tr>
    </table>
  </td></tr>

  ${buildSemaforoBlock(data.semaforo)}
  ${buildReliabilityBlock(data.reliability)}
  ${buildTop5(data.installationSummaries)}

  ${data.operatorComments ? `<tr><td style="padding:0 32px 16px">
    <div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:6px;padding:12px 16px">
      <p style="margin:0 0 4px;font-size:11px;color:#92400e;font-weight:600;text-transform:uppercase">Comentarios del operador</p>
      <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5;white-space:pre-wrap">${esc(data.operatorComments)}</p>
    </div>
  </td></tr>` : ""}

  <!-- CTA -->
  <tr><td style="padding:8px 32px 12px" align="center">
    <a href="${monitorUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:12px 24px;border-radius:8px">Ver en OPAI</a>
  </td></tr>
  ${hasPdf ? `<tr><td style="padding:0 32px 24px" align="center"><p style="margin:0;font-size:12px;color:#94a3b8">PDF con detalle completo adjunto (matriz 7 días + ranking guardias)</p></td></tr>` : ""}

  <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;background:#f8fafc">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center">Sistema OPAI — Reporte generado automáticamente</p>
    <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;text-align:center">
      ¿No quieres recibir este tipo de alertas?
      <a href="${baseUrl}/opai/perfil/notificaciones" style="color:#0ea5e9;text-decoration:underline">Administrar notificaciones</a>
    </p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

// ─── Send ──────────────────────────────────────────────────────────────

/**
 * Sends the turno close summary email to the ops email.
 * If pdfData is provided, generates the PDF and attaches it.
 */
export async function sendMonitorTurnoEmail(
  data: MonitorEmailData,
  recipients?: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cfg = await getTenantCompanyConfig(data.tenantId);

    const defaultEmail = cfg.emailOps || "";
    const to = [...new Set([defaultEmail, ...(recipients ?? [])])];
    const dateStr = data.startedAt.toLocaleDateString("es-CL", { day: "2-digit", month: "short", timeZone: "America/Santiago" });
    const subject = `📋 Reporte Turno ${dateStr} - ${esc(data.operatorName)}`;

    // Generate PDF if data provided
    const attachments: { filename: string; content: Buffer }[] = [];
    if (data.pdfData) {
      try {
        console.log("[MONITOR_EMAIL] Starting PDF generation...");
        const { renderMonitorTurnoPdfBuffer } = await import("./monitor-turno-pdf");
        const pdfBuffer = await renderMonitorTurnoPdfBuffer(data.pdfData);
        const dateFile = data.startedAt.toISOString().slice(0, 10);
        attachments.push({
          filename: `Reporte-Turno-${dateFile}.pdf`,
          content: Buffer.from(pdfBuffer),
        });
        console.log(`[MONITOR_EMAIL] PDF generated: ${(pdfBuffer.byteLength / 1024).toFixed(0)} KB`);
      } catch (pdfErr) {
        console.error("[MONITOR_EMAIL] PDF generation failed, sending without attachment:", pdfErr instanceof Error ? pdfErr.message : pdfErr);
        console.error("[MONITOR_EMAIL] PDF error stack:", pdfErr instanceof Error ? pdfErr.stack : "no stack");
      }
    } else {
      console.warn("[MONITOR_EMAIL] No pdfData provided, skipping PDF generation");
    }

    const response = await resend.emails.send({
      from: cfg.emailFrom,
      to,
      replyTo: cfg.emailReplyTo,
      subject,
      html: buildHtml(data),
      attachments: attachments.length > 0 ? attachments : undefined,
      tags: [{ name: "type", value: "monitoreo_turno" }],
    });

    if (response.error) {
      console.error("[MONITOR_EMAIL] Resend error:", response.error);
      return { ok: false, error: JSON.stringify(response.error) };
    }
    return { ok: true };
  } catch (error) {
    console.error("[MONITOR_EMAIL] Error:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Error desconocido" };
  }
}
