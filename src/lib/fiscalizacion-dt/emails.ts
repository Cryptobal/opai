/**
 * Plantillas de correo del portal de fiscalización DT.
 * Remitente: EMAIL_CONFIG.from (noreply@opai.cl). No nominativo (Art. 24 b).
 */

import { EMAIL_CONFIG, buildDeliverabilityHeaders } from "@/lib/resend";
import { PROVIDER_DISPLAY_NAME, getAppVersion } from "@/lib/app-version";

export const ART_24_B_BODY =
  "Se informa a usted que, de acuerdo con las facultades y obligaciones legales contenidas en el Código del Trabajo y sus leyes complementarias; en el D.F.L. Nº2 de 1967, del Ministerio del Trabajo y Previsión Social, y en otras disposiciones reglamentarias, se está iniciando un procedimiento de fiscalización laboral.";

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
  <p style="margin:0 0 12px 0;font-weight:bold">${PROVIDER_DISPLAY_NAME}</p>
  ${bodyHtml}
  <p style="margin:24px 0 0 0;font-size:12px;color:#555">Sistema electrónico de registro y control de asistencia · v${getAppVersion()}</p>
</body>
</html>`;
}

export function accessCodeEmailHtml(code: string, expiresAt: Date): string {
  const vigencia = expiresAt.toLocaleString("es-CL", { timeZone: "America/Santiago" });
  return wrapHtml(
    "Clave de acceso — Portal de Fiscalización",
    `<p>Se ha solicitado una clave de acceso al portal de fiscalización de ${PROVIDER_DISPLAY_NAME}.</p>
     <p>Su clave es: <strong style="font-size:18px;letter-spacing:2px">${code}</strong></p>
     <p>Vigencia: 5 días corridos (caduca el ${vigencia}).</p>
     <p>Si usted no solicitó esta clave, ignore este mensaje.</p>`,
  );
}

export function accessCodeEmailText(code: string, expiresAt: Date): string {
  const vigencia = expiresAt.toLocaleString("es-CL", { timeZone: "America/Santiago" });
  return [
    PROVIDER_DISPLAY_NAME,
    "",
    "Se ha solicitado una clave de acceso al portal de fiscalización.",
    `Su clave es: ${code}`,
    `Vigencia: 5 días corridos (caduca el ${vigencia}).`,
    "Si usted no solicitó esta clave, ignore este mensaje.",
  ].join("\n");
}

export function art24bEmailHtml(): string {
  return wrapHtml("Fiscalización laboral", `<p>${ART_24_B_BODY}</p>`);
}

export function art24bEmailText(): string {
  return `${PROVIDER_DISPLAY_NAME}\n\n${ART_24_B_BODY}`;
}

export async function sendDtEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { resend } = await import("@/lib/resend");
    const result = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      headers: buildDeliverabilityHeaders(),
    });
    if (result.error) {
      console.error("[FISCALIZACION-DT] Error al enviar correo:", result.error);
      return { ok: false, error: "send_failed" };
    }
    return { ok: true };
  } catch (error) {
    console.error("[FISCALIZACION-DT] Error al enviar correo:", error);
    return { ok: false, error: "send_failed" };
  }
}

export async function sendAccessCodeEmail(to: string, code: string, expiresAt: Date) {
  return sendDtEmail({
    to,
    subject: "Clave de acceso — Portal de Fiscalización DT",
    html: accessCodeEmailHtml(code, expiresAt),
    text: accessCodeEmailText(code, expiresAt),
  });
}

export async function sendArt24bNotice(to: string) {
  return sendDtEmail({
    to,
    subject: "Procedimiento de fiscalización laboral",
    html: art24bEmailHtml(),
    text: art24bEmailText(),
  });
}

export function dailyReportEmailHtml(params: {
  employerName: string;
  ymd: string;
  installationName?: string;
  rows: { trabajador: string; rut: string; entrada: string; salida: string; observaciones: string }[];
}): string {
  const rowsHtml =
    params.rows.length === 0
      ? "<tr><td colspan=\"5\">No hay trabajadores que coincidan con la selección</td></tr>"
      : params.rows
          .map(
            (r) =>
              `<tr><td>${r.trabajador}</td><td>${r.rut}</td><td>${r.entrada}</td><td>${r.salida}</td><td>${r.observaciones}</td></tr>`,
          )
          .join("");
  const inst = params.installationName ? ` · ${params.installationName}` : "";
  return wrapHtml(
    "Reporte diario de asistencia",
    `<p>Reporte diario de marcaciones del ${params.ymd} — ${params.employerName}${inst}.</p>
     <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:12px">
       <thead><tr><th>Trabajador</th><th>RUT</th><th>Entrada</th><th>Salida</th><th>Observaciones</th></tr></thead>
       <tbody>${rowsHtml}</tbody>
     </table>`,
  );
}

export function dailyReportEmailText(params: {
  employerName: string;
  ymd: string;
  rows: { trabajador: string; rut: string; entrada: string; salida: string }[];
}): string {
  const lines = params.rows.map((r) => `${r.trabajador} | ${r.rut} | ${r.entrada} | ${r.salida}`);
  return `${PROVIDER_DISPLAY_NAME}\nReporte diario ${params.ymd} — ${params.employerName}\n\n${lines.join("\n") || "No hay trabajadores que coincidan con la selección"}`;
}

export async function sendDailyReportEmail(
  to: string,
  params: {
    employerName: string;
    ymd: string;
    installationName?: string;
    rows: { trabajador: string; rut: string; entrada: string; salida: string; observaciones: string }[];
  },
) {
  const inst = params.installationName ? ` (${params.installationName})` : "";
  return sendDtEmail({
    to,
    subject: `Reporte diario de asistencia ${params.ymd}${inst}`,
    html: dailyReportEmailHtml(params),
    text: dailyReportEmailText(params),
  });
}
