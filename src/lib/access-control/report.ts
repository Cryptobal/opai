/**
 * Renderer de reporte automático de control de acceso.
 *
 * Email-safe HTML (no Tailwind) con resumen de la ventana definida por el
 * schedule (daily | weekly | monthly).
 */

import { prisma } from "@/lib/prisma";

export interface ReportArgs {
  tenantId: string;
  installationId: string;
  installationName: string;
  schedule: string; // 'daily' | 'weekly' | 'monthly'
  now: Date;
}

export interface ReportResult {
  html: string;
  periodLabel: string;
  periodFrom: Date;
  periodTo: Date;
  totalRecords: number;
}

function periodFor(schedule: string, now: Date): {
  from: Date;
  to: Date;
  label: string;
} {
  const to = new Date(now);
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  if (schedule === "weekly") {
    from.setDate(to.getDate() - 7);
    return { from, to, label: "semanal" };
  }
  if (schedule === "monthly") {
    from.setDate(to.getDate() - 30);
    return { from, to, label: "mensual" };
  }
  // daily
  from.setDate(to.getDate() - 1);
  return { from, to, label: "diario" };
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderAccessControlReport(
  args: ReportArgs
): Promise<ReportResult> {
  const { tenantId, installationId, installationName, schedule, now } = args;
  const { from, to, label } = periodFor(schedule, now);

  const [records, deniedAttempts] = await Promise.all([
    prisma.accessControlRecord.findMany({
      where: { tenantId, installationId, entryAt: { gte: from, lt: to } },
      orderBy: { entryAt: "desc" },
      take: 200,
      select: {
        id: true,
        recordType: true,
        rut: true,
        fullName: true,
        company: true,
        vehiclePlate: true,
        entryAt: true,
        exitAt: true,
        listMatch: true,
      },
    }),
    prisma.accessControlDeniedAttempt.count({
      where: { tenantId, installationId, attemptedAt: { gte: from, lt: to } },
    }),
  ]);

  const stats = {
    total: records.length,
    inSite: records.filter((r) => !r.exitAt).length,
    blacklist: records.filter((r) => r.listMatch === "blacklist").length,
    whitelist: records.filter((r) => r.listMatch === "whitelist").length,
  };

  const recordsRows = records
    .slice(0, 100)
    .map(
      (r) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${fmtDate(r.entryAt)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(r.fullName) || "—"}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(r.rut) || "—"}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(r.company) || "—"}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(r.recordType)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${r.exitAt ? fmtDate(r.exitAt) : "<em style=\"color:#888\">en sitio</em>"}</td>
      </tr>`
    )
    .join("");

  const periodLabel = label;
  const html = `
    <!doctype html>
    <html>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;margin:0;padding:24px;color:#222;">
      <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5;">
        <div style="background:#0f172a;color:#fff;padding:20px 24px;">
          <h1 style="margin:0;font-size:18px;font-weight:600;">Reporte ${escapeHtml(periodLabel)} de control de acceso</h1>
          <p style="margin:4px 0 0;color:#cbd5e1;font-size:13px;">${escapeHtml(installationName)}</p>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Período: ${fmtDate(from)} – ${fmtDate(to)}</p>
        </div>

        <div style="padding:20px 24px;display:flex;flex-wrap:wrap;gap:12px;border-bottom:1px solid #eee;">
          <div style="flex:1;min-width:120px;">
            <div style="font-size:12px;color:#666;">Registros totales</div>
            <div style="font-size:24px;font-weight:600;">${stats.total}</div>
          </div>
          <div style="flex:1;min-width:120px;">
            <div style="font-size:12px;color:#666;">En sitio actualmente</div>
            <div style="font-size:24px;font-weight:600;color:#059669;">${stats.inSite}</div>
          </div>
          <div style="flex:1;min-width:120px;">
            <div style="font-size:12px;color:#666;">Lista blanca</div>
            <div style="font-size:24px;font-weight:600;">${stats.whitelist}</div>
          </div>
          <div style="flex:1;min-width:120px;">
            <div style="font-size:12px;color:#666;">Intentos denegados</div>
            <div style="font-size:24px;font-weight:600;color:#dc2626;">${deniedAttempts}</div>
          </div>
        </div>

        <div style="padding:20px 24px;">
          <h2 style="font-size:14px;margin:0 0 12px;color:#444;">Registros del período</h2>
          ${
            records.length === 0
              ? '<p style="color:#666;font-size:13px;margin:0;">Sin registros en este período.</p>'
              : `
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:8px;text-align:left;color:#475569;font-weight:600;">Entrada</th>
                  <th style="padding:8px;text-align:left;color:#475569;font-weight:600;">Persona</th>
                  <th style="padding:8px;text-align:left;color:#475569;font-weight:600;">RUT</th>
                  <th style="padding:8px;text-align:left;color:#475569;font-weight:600;">Empresa</th>
                  <th style="padding:8px;text-align:left;color:#475569;font-weight:600;">Tipo</th>
                  <th style="padding:8px;text-align:left;color:#475569;font-weight:600;">Salida</th>
                </tr>
              </thead>
              <tbody>${recordsRows}</tbody>
            </table>
            ${records.length > 100 ? `<p style="color:#888;font-size:12px;margin-top:8px;">Mostrando primeros 100 de ${records.length} registros.</p>` : ""}
          `
          }
        </div>

        <div style="background:#f8fafc;padding:14px 24px;color:#888;font-size:12px;text-align:center;">
          Reporte generado automáticamente por <strong>Opai</strong>.
        </div>
      </div>
    </body>
    </html>
  `;

  return {
    html,
    periodLabel,
    periodFrom: from,
    periodTo: to,
    totalRecords: records.length,
  };
}
