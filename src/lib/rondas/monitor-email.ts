/**
 * Email de resumen de turno de monitoreo.
 *
 * Se envía al cerrar un turno con el resumen de rondas,
 * alertas y comentarios del operador.
 */

import { resend } from "@/lib/resend";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

interface MonitorEmailData {
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
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function trustColor(score: number): string {
  if (score >= 80) return "#15803d";
  if (score >= 60) return "#d97706";
  return "#dc2626";
}

function buildHtml(data: MonitorEmailData): string {
  const baseUrl = data.baseUrl.replace(/\/+$/, "");
  const monitorUrl = `${baseUrl}/ops/rondas/monitor`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden">
        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:24px 32px">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Resumen de Turno</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#ffffff">Monitoreo de Rondas</p>
          </td>
        </tr>
        <!-- Turno info -->
        <tr>
          <td style="padding:20px 32px 16px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#64748b;width:140px">Operador</td>
                <td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:500">${escapeHtml(data.operatorName)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#64748b">Inicio</td>
                <td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:500">${formatDateTime(data.startedAt)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#64748b">Fin</td>
                <td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:500">${formatDateTime(data.endedAt)}</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- KPIs -->
        <tr>
          <td style="padding:0 32px 16px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
              <tr>
                <td style="padding:12px 16px;text-align:center;border-right:1px solid #e2e8f0;width:25%">
                  <p style="margin:0;font-size:24px;font-weight:700;color:#1e293b">${data.totalRounds}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#64748b">Rondas</p>
                </td>
                <td style="padding:12px 16px;text-align:center;border-right:1px solid #e2e8f0;width:25%">
                  <p style="margin:0;font-size:24px;font-weight:700;color:#15803d">${data.completadas}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#64748b">Completadas</p>
                </td>
                <td style="padding:12px 16px;text-align:center;border-right:1px solid #e2e8f0;width:25%">
                  <p style="margin:0;font-size:24px;font-weight:700;color:${trustColor(data.trustAvg)}">${data.trustAvg}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#64748b">Trust Avg</p>
                </td>
                <td style="padding:12px 16px;text-align:center;width:25%">
                  <p style="margin:0;font-size:24px;font-weight:700;color:${data.totalAlerts > 0 ? "#dc2626" : "#15803d"}">${data.totalAlerts}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#64748b">Alertas</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Summary -->
        <tr>
          <td style="padding:0 32px 16px">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #22c55e;border-radius:6px;padding:12px 16px">
              <p style="margin:0 0 4px;font-size:11px;color:#15803d;font-weight:600;text-transform:uppercase">Resumen del turno</p>
              <p style="margin:0;font-size:13px;color:#14532d;line-height:1.5;white-space:pre-wrap">${escapeHtml(data.aiSummary)}</p>
            </div>
          </td>
        </tr>
        ${data.operatorComments ? `
        <!-- Operator comments -->
        <tr>
          <td style="padding:0 32px 16px">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px">
              <p style="margin:0 0 4px;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase">Comentarios del operador</p>
              <p style="margin:0;font-size:13px;color:#334155;white-space:pre-wrap">${escapeHtml(data.operatorComments)}</p>
            </div>
          </td>
        </tr>` : ""}
        <!-- CTA -->
        <tr>
          <td style="padding:0 32px 24px" align="center">
            <a
              href="${monitorUrl}"
              target="_blank"
              rel="noopener noreferrer"
              style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px"
            >
              Ver en OPAI
            </a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e2e8f0">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center">
              Sistema OPAI - Reporte generado automaticamente
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Sends the turno close summary email to the ops email.
 * Called from the turno close endpoint when emailRecipients are provided.
 */
export async function sendMonitorTurnoEmail(
  data: MonitorEmailData,
  recipients?: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cfg = await getTenantCompanyConfig(data.tenantId);

    const defaultEmail = cfg.emailOps || "operaciones@gard.cl";
    const to = [...new Set([defaultEmail, ...(recipients ?? [])])];
    const dateStr = data.startedAt.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
    });
    const subject = `Resumen Turno Monitoreo ${dateStr} - ${escapeHtml(data.operatorName)}`;

    const response = await resend.emails.send({
      from: cfg.emailFrom,
      to,
      replyTo: cfg.emailReplyTo,
      subject,
      html: buildHtml(data),
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
