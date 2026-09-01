/**
 * Envío de comprobante de marcación por email.
 * 
 * Requisito Resolución Exenta N°38:
 * El trabajador debe poder acceder a sus registros de asistencia.
 * El comprobante por email complementa el acceso vía web.
 */

import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { PLATFORM_DEFAULT_EMAIL_FROM } from "@/lib/platform-email";
import { prisma } from "@/lib/prisma";
import { parseMarcacionConfigValue } from "@/lib/ops-marcacion-config";
import { getNotificationPrefsUrl } from "@/lib/emails/site-url";
import {
  formatFechaComprobante,
  formatHoraComprobante,
  formatRutComprobante,
} from "@/lib/marcacion-format";

interface ComprobanteMarcacion {
  guardiaName: string;
  guardiaEmail?: string;
  guardiaRut: string;
  installationName: string;
  tipo: "entrada" | "salida";
  timestamp: Date;
  deviceTimestamp?: Date | null;
  receivedAt?: Date | null;
  geoValidada: boolean;
  geoDistanciaM: number | null;
  gpsStatus: "dentro_rango" | "fuera_rango" | "sin_gps";
  hashIntegridad: string;
  lat: number | null;
  lng: number | null;
  employerName?: string | null;
  employerRut?: string | null;
  establishmentAddress?: string | null;
  dtResolutionNumber?: string | null;
  dtResolutionDate?: Date | null;
  mandanteName?: string | null;
  mandanteRut?: string | null;
  verifyUrl?: string | null;
  ccEmails?: string[];
}

/**
 * Envía un comprobante de marcación por email al guardia.
 * Solo envía si el guardia tiene email configurado.
 * Es fire-and-forget — no bloquea el flujo de marcación.
 */
export function buildMarcacionComprobanteHtml(data: ComprobanteMarcacion): {
  subject: string;
  html: string;
} {
  const tipoLabel = data.tipo === "entrada" ? "Entrada" : "Salida";
  const hora = formatHoraComprobante(data.timestamp);
  const fecha = formatFechaComprobante(data.timestamp);
  const rutTrabajador = formatRutComprobante(data.guardiaRut);
  const rutEmpleador = data.employerRut ? formatRutComprobante(data.employerRut) : "—";
  const geoStatusLabel =
    data.gpsStatus === "dentro_rango"
      ? `Ubicación validada${data.geoDistanciaM != null ? ` (${data.geoDistanciaM} m)` : ""}`
      : data.gpsStatus === "fuera_rango"
      ? `Fuera de rango${data.geoDistanciaM != null ? ` (${data.geoDistanciaM} m)` : ""}`
      : "Sin geolocalización";
  const geoStatusColor =
    data.gpsStatus === "dentro_rango" ? "#059669"
      : data.gpsStatus === "fuera_rango" ? "#d97706"
      : "#64748b";
  const gpsCoords = data.lat != null && data.lng != null
    ? `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}`
    : null;
  const resolucion = data.dtResolutionNumber
    ? `${data.dtResolutionNumber}${data.dtResolutionDate ? ` (vigencia ${formatFechaComprobante(data.dtResolutionDate)})` : ""}`
    : null;
  const receivedAt = data.receivedAt ?? null;
  const deviceTs = data.deviceTimestamp ?? null;

  const row = (label: string, value: string, extra = "") => `
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 160px; vertical-align: top;">${label}</td>
            <td style="padding: 6px 0; color: #0f172a; ${extra}">${value}</td>
          </tr>`;

  const subject = `Comprobante de ${tipoLabel} — ${data.installationName} — ${fecha} ${hora}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <style>
        @media print {
          body { background: #fff !important; }
          a { color: #0f172a !important; text-decoration: none; }
        }
      </style>
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="margin: 0 0 4px; color: #0f172a; font-size: 18px;">Comprobante de marcación</h1>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Res. Exenta N°38, Dirección del Trabajo de Chile</p>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          ${row("Trabajador", escapeHtml(data.guardiaName), "font-weight: 600;")}
          ${row("RUT trabajador", escapeHtml(rutTrabajador))}
          ${row("Tipo", tipoLabel, `font-weight: 600; color: ${data.tipo === "entrada" ? "#059669" : "#ea580c"};`)}
          ${row("Fecha", fecha)}
          ${row("Hora", hora, "font-size: 16px; font-weight: 700;")}
          ${row("Empleador", escapeHtml(data.employerName || EMAIL_CONFIG.companyName), "font-weight: 600;")}
          ${row("RUT empleador", escapeHtml(rutEmpleador))}
          ${row("Establecimiento", escapeHtml(data.installationName), "font-weight: 600;")}
          ${row("Dirección", escapeHtml(data.establishmentAddress || "—"))}
          ${resolucion ? row("Jornada excepcional", escapeHtml(resolucion)) : ""}
          ${data.mandanteName ? row("Mandante", escapeHtml(`${data.mandanteName}${data.mandanteRut ? ` — ${formatRutComprobante(data.mandanteRut)}` : ""}`)) : ""}
          ${row("Ubicación", geoStatusLabel, `color: ${geoStatusColor};`)}
          ${gpsCoords ? row("Coordenadas", gpsCoords, "font-family: monospace; font-size: 12px;") : ""}
          ${deviceTs ? row("Hora del dispositivo", `${formatFechaComprobante(deviceTs)} ${formatHoraComprobante(deviceTs)}`) : ""}
          ${receivedAt ? row("Hora de recepción", `${formatFechaComprobante(receivedAt)} ${formatHoraComprobante(receivedAt)}`) : ""}
        </table>
      </div>

      <div style="background: #f1f5f9; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <p style="color: #64748b; font-size: 12px; margin: 0 0 4px;">Hash de integridad (SHA-256)</p>
        <p style="color: #475569; font-size: 12px; font-family: monospace; word-break: break-all; margin: 0;">${escapeHtml(data.hashIntegridad)}</p>
      </div>

      ${data.verifyUrl ? `
      <div style="text-align: center; margin-bottom: 16px;">
        <a href="${escapeHtml(data.verifyUrl)}"
           style="display: inline-block; background: #0f172a; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Verificar comprobante
        </a>
      </div>` : ""}

      <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          Enviado desde noreply@opai.cl — ${EMAIL_CONFIG.companyName}
        </p>
        <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0;">
          Sello de tiempo: ${data.timestamp.toISOString()}
        </p>
      </div>
    </div>
  `;

  return { subject, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Envía un comprobante de marcación por email al guardia.
 * Solo envía si el guardia tiene email configurado.
 * Es fire-and-forget — no bloquea el flujo de marcación.
 */
export async function sendMarcacionComprobante(data: ComprobanteMarcacion): Promise<void> {
  if (!data.guardiaEmail) return;

  const { subject, html } = buildMarcacionComprobanteHtml(data);
  const cc = (data.ccEmails ?? [])
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e !== data.guardiaEmail!.trim().toLowerCase());

  await resend.emails.send({
    from: PLATFORM_DEFAULT_EMAIL_FROM,
    to: data.guardiaEmail,
    ...(cc.length > 0 ? { cc } : {}),
    subject,
    html,
  });
}

/* ─── Aviso de Marca Manual ─── */

interface AvisoMarcaManual {
  guardiaName: string;
  guardiaEmail?: string;
  guardiaRut: string;
  installationName: string;
  empresaName: string;
  empresaRut: string;
  tipo: "entrada" | "salida";
  fechaMarca: string; // YYYY-MM-DD
  horaMarca: string; // HH:MM:SS
  tipoAjuste: string; // "Omitido", "Corrección manual", etc.
  motivo?: string;
  hashIntegridad: string;
  registradoPor: string; // nombre del supervisor
  clausulaLegal: string;
}

/**
 * Envía aviso de marca manual al guardia cuando se registra asistencia
 * sin marcación digital previa.
 * Equivalente al "Aviso Marca Manual FaceID" del sistema ControlRoll.
 */
export async function sendAvisoMarcaManual(data: AvisoMarcaManual): Promise<void> {
  if (!data.guardiaEmail) return;

  const tipoLabel = data.tipo === "entrada" ? "Entrada Laboral" : "Salida Laboral";

  const subject = `Aviso Marca Manual — ${data.installationName} — ${data.fechaMarca}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; background: #f59e0b; border-radius: 50%; line-height: 48px; text-align: center;">
          <span style="color: white; font-size: 20px;">✋</span>
        </div>
        <h2 style="margin: 12px 0 4px; color: #0f172a; font-size: 18px;">Aviso Marca Manual</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Registro de asistencia ajustado manualmente</p>
      </div>

      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="color: #92400e; font-size: 12px; margin: 0; line-height: 1.5;">
          Estimado/a <strong>${data.guardiaName}</strong>, RUT ${data.guardiaRut}:
        </p>
        <p style="color: #92400e; font-size: 12px; margin: 8px 0 0; line-height: 1.5;">
          Con fecha <strong>${new Date().toLocaleDateString("es-CL")}</strong>, se realiza un ajuste de tipo
          <strong>${data.tipoAjuste}</strong> de la no marcación original de tipo <strong>${tipoLabel}</strong>.
        </p>
        <p style="color: #92400e; font-size: 12px; margin: 8px 0 0; line-height: 1.5;">
          Quedando como nuevo registro la marca de tipo <strong>${tipoLabel}</strong>
          con fecha <strong>${data.fechaMarca}</strong> y hora <strong>${data.horaMarca}</strong>${data.motivo ? ` por motivo: ${data.motivo}` : ""}.
        </p>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; width: 140px; vertical-align: top;">Nombre</td>
            <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${data.guardiaName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">RUN</td>
            <td style="padding: 8px 0; color: #0f172a;">${data.guardiaRut}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Marca</td>
            <td style="padding: 8px 0; color: ${data.tipo === "entrada" ? "#059669" : "#ea580c"}; font-weight: 600;">${tipoLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Fecha</td>
            <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${data.fechaMarca}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Hora</td>
            <td style="padding: 8px 0; color: #0f172a; font-size: 15px; font-weight: 700;">${data.horaMarca}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Tipo Ajuste</td>
            <td style="padding: 8px 0; color: #0f172a;">${data.tipoAjuste}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Registrado por</td>
            <td style="padding: 8px 0; color: #0f172a;">${data.registradoPor}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Empresa</td>
            <td style="padding: 8px 0; color: #0f172a;">${data.empresaName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">RUT Empresa</td>
            <td style="padding: 8px 0; color: #0f172a;">${data.empresaRut}</td>
          </tr>
        </table>
      </div>

      <div style="background: #f1f5f9; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <p style="color: #64748b; font-size: 10px; margin: 0 0 4px;">Hash de integridad (SHA-256)</p>
        <p style="color: #475569; font-size: 10px; font-family: monospace; word-break: break-all; margin: 0;">${data.hashIntegridad}</p>
      </div>

      <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <p style="color: #78350f; font-size: 11px; margin: 0; line-height: 1.5;">
          <strong>Nota:</strong> "${data.clausulaLegal}"
        </p>
      </div>

      <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; font-size: 10px; margin: 0;">
          ${EMAIL_CONFIG.companyName} — Registro conforme a Res. Exenta N°38, DT Chile
        </p>
        <p style="color: #94a3b8; font-size: 10px; margin: 4px 0 0;">
          Sello de tiempo de la marca: ${data.fechaMarca} ${data.horaMarca}
        </p>
      </div>
    </div>
  `;

  await resend.emails.send({
    from: EMAIL_CONFIG.from,
    to: data.guardiaEmail,
    subject,
    html,
  });
}

/* ─── Aviso de Modificación con Link de Oposición ─── */

export interface AvisoModificacionMarcacion {
  guardiaName: string;
  guardiaEmail: string;
  guardiaRut: string;
  installationName: string;
  tipo: "entrada" | "salida";
  timestampOriginal: Date;
  timestampNuevo: Date;
  motivo: string;
  registradoPor: string;
  oppositionUrl: string; // {baseUrl}/marcacion/oposicion/[token]
}

/**
 * Envía aviso de modificación de marcación con link único para que el
 * trabajador pueda oponerse dentro del plazo de 48 horas (Res. N°38 Art. 5).
 */
export async function sendAvisoModificacionMarcacion(data: AvisoModificacionMarcacion): Promise<void> {
  const tipoLabel = data.tipo === "entrada" ? "Entrada" : "Salida";

  const fmt = (d: Date) =>
    d.toLocaleString("es-CL", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "America/Santiago",
    });

  const subject = `Aviso de Modificación de Marcación — ${data.installationName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; background: #d97706; border-radius: 50%; line-height: 48px; text-align: center;">
          <span style="color: white; font-size: 20px;">✏️</span>
        </div>
        <h2 style="margin: 12px 0 4px; color: #0f172a; font-size: 18px;">Modificación de Marcación</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Su registro de asistencia fue modificado</p>
      </div>

      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.6;">
          Estimado/a <strong>${data.guardiaName}</strong>, su marcación de <strong>${tipoLabel}</strong>
          en <strong>${data.installationName}</strong> fue modificada por <strong>${data.registradoPor}</strong>.
        </p>
        <p style="color: #92400e; font-size: 12px; margin: 8px 0 0;">
          Motivo: ${data.motivo}
        </p>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 150px;">Tipo</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${tipoLabel}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Instalación</td>
            <td style="padding: 6px 0; color: #0f172a;">${data.installationName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Marca original</td>
            <td style="padding: 6px 0; color: #ef4444; text-decoration: line-through;">${fmt(data.timestampOriginal)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Nueva marca</td>
            <td style="padding: 6px 0; color: #059669; font-weight: 700;">${fmt(data.timestampNuevo)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Modificado por</td>
            <td style="padding: 6px 0; color: #0f172a;">${data.registradoPor}</td>
          </tr>
        </table>
      </div>

      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 16px; text-align: center;">
        <p style="color: #991b1b; font-size: 13px; margin: 0 0 12px; font-weight: 600;">
          ¿No está de acuerdo con esta modificación?
        </p>
        <p style="color: #7f1d1d; font-size: 12px; margin: 0 0 16px; line-height: 1.5;">
          Tiene <strong>48 horas</strong> para oponerse. Si no lo hace, la modificación quedará consolidada.
        </p>
        <a href="${data.oppositionUrl}"
           style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Oponerme a esta modificación
        </a>
      </div>

      <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; font-size: 10px; margin: 0;">
          ${EMAIL_CONFIG.companyName} — Conforme a Res. Exenta N°38, DT Chile
        </p>
        <p style="color: #94a3b8; font-size: 10px; margin: 4px 0 0;">
          Este link es único e intransferible. Expira en 48 horas.
        </p>
      </div>
    </div>
  `;

  await resend.emails.send({
    from: EMAIL_CONFIG.from,
    to: data.guardiaEmail,
    subject,
    html,
  });
}

/* ─── Notificación al Supervisor: Marcación Fuera de Rango ─── */

interface NotificacionFueraDeRango {
  tenantId: string;
  installationId: string;
  installationName: string;
  installationLat: number | null;
  installationLng: number | null;
  guardiaName: string;
  guardiaRut: string;
  tipo: "entrada" | "salida";
  timestamp: Date;
  geoDistanciaM: number | null;
  geoRadiusM: number;
  lat: number | null;
  lng: number | null;
  deviceDisplay?: string; // "Equipo sincronizado: X" | "Dispositivo del usuario: Y" | "Navegador web"
}

/**
 * Envía notificación por email a los supervisores asignados a la instalación
 * cuando un guardia marca fuera del rango geográfico configurado.
 */
export async function sendNotificacionFueraDeRango(data: NotificacionFueraDeRango): Promise<void> {
  const marcacionConfigSetting = await prisma.setting.findFirst({
    where: { key: `marcacion_config:${data.tenantId}` },
    select: { value: true },
  });
  const marcacionConfig = parseMarcacionConfigValue(marcacionConfigSetting?.value);

  if (!marcacionConfig.emailAlertaFueraRangoEnabled) {
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: data.tenantId },
    select: { slug: true },
  });
  const prefsUrl = getNotificationPrefsUrl(tenant?.slug ?? null);

  const [assignments, extraUsers] = await Promise.all([
    marcacionConfig.emailAlertaFueraRangoIncludeSupervisors
      ? prisma.opsAsignacionSupervisor.findMany({
          where: {
            installationId: data.installationId,
            isActive: true,
          },
          select: {
            supervisor: { select: { email: true } },
          },
        })
      : Promise.resolve([]),
    marcacionConfig.emailAlertaFueraRangoUserIds.length > 0
      ? prisma.admin.findMany({
          where: {
            tenantId: data.tenantId,
            status: "active",
            id: { in: marcacionConfig.emailAlertaFueraRangoUserIds },
          },
          select: { email: true },
        })
      : Promise.resolve([]),
  ]);

  const supervisorEmails = assignments
    .map((a) => a.supervisor.email)
    .filter((email): email is string => Boolean(email));
  const extraEmails = extraUsers
    .map((u) => u.email)
    .filter((email): email is string => Boolean(email));
  const recipientEmails = Array.from(
    new Set(
      [...supervisorEmails, ...extraEmails]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (recipientEmails.length === 0) {
    console.warn(`[marcacion] Sin destinatarios configurados para fuera de rango en ${data.installationName}`);
    return;
  }

  const tipoLabel = data.tipo === "entrada" ? "Entrada" : "Salida";
  const hora = data.timestamp.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Santiago",
  });
  const fecha = data.timestamp.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  });
  const gpsCoords = data.lat != null && data.lng != null
    ? `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}`
    : "No disponible";

  const deviceDisplay = data.deviceDisplay ?? "No especificado";

  // Mapa estático: ubicación marcación (rojo) vs instalación (verde)
  const hasMarcacionCoords = data.lat != null && data.lng != null;
  const hasInstalacionCoords = data.installationLat != null && data.installationLng != null;
  const hasBothCoords = hasMarcacionCoords && hasInstalacionCoords;
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  let mapSection = "";
  if (hasBothCoords) {
    const centerLat = (data.lat! + data.installationLat!) / 2;
    const centerLng = (data.lng! + data.installationLng!) / 2;

    // Zoom dinámico según distancia entre puntos
    const distKm = (data.geoDistanciaM ?? 0) / 1000;
    const zoom = distKm > 50 ? 9 : distKm > 20 ? 10 : distKm > 10 ? 11 : distKm > 5 ? 12 : 13;

    // URL muestra ambos marcadores (no modo direcciones para evitar confusión)
    const mapsUrl = `https://www.google.com/maps?q=${data.lat!.toFixed(6)},${data.lng!.toFixed(6)}&z=${zoom}`;

    if (mapsKey) {
      const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${centerLat.toFixed(6)},${centerLng.toFixed(6)}&zoom=${zoom}&size=480x240&scale=2&markers=color:red%7Clabel:M%7C${data.lat!.toFixed(6)},${data.lng!.toFixed(6)}&markers=color:green%7Clabel:I%7C${data.installationLat!.toFixed(6)},${data.installationLng!.toFixed(6)}&key=${mapsKey}`;
      mapSection = `
      <div style="margin-bottom: 16px; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
        <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="display: block;">
          <img src="${staticMapUrl}" alt="Mapa: ubicación de marcación vs instalación" width="480" height="240" style="display: block; max-width: 100%; height: auto;" />
        </a>
        <p style="font-size: 11px; color: #64748b; margin: 4px 12px 8px;">🔴 <strong>M</strong> Punto de marcación — 🟢 <strong>I</strong> Instalación · <a href="${mapsUrl}" style="color: #2563eb;">Ver en Google Maps</a></p>
      </div>`;
    } else {
      mapSection = `
      <div style="margin-bottom: 16px;">
        <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #2563eb; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600;">
          Ver ubicación en Google Maps
        </a>
        <p style="font-size: 11px; color: #64748b; margin: 8px 0 0;">🔴 Punto de marcación — 🟢 Instalación</p>
      </div>`;
    }
  }

  const subject = `Alerta: Marcación fuera de rango — ${data.guardiaName} — ${data.installationName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; background: #d97706; border-radius: 50%; line-height: 48px; text-align: center;">
          <span style="color: white; font-size: 20px;">⚠</span>
        </div>
        <h2 style="margin: 12px 0 4px; color: #0f172a; font-size: 18px;">Marcación Fuera de Rango</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Un guardia marcó asistencia fuera del radio autorizado</p>
      </div>

      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.6;">
          <strong>${data.guardiaName}</strong> (RUT ${data.guardiaRut}) realizó una marcación de
          <strong>${tipoLabel}</strong> a ${data.geoDistanciaM != null ? `<strong>${data.geoDistanciaM}m</strong>` : "una distancia desconocida"}
          de la instalación (radio permitido: ${data.geoRadiusM}m).
        </p>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 130px;">Guardia</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${data.guardiaName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">RUT</td>
            <td style="padding: 6px 0; color: #0f172a;">${data.guardiaRut}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Instalación</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${data.installationName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Tipo</td>
            <td style="padding: 6px 0; color: ${data.tipo === "entrada" ? "#059669" : "#ea580c"}; font-weight: 600;">${tipoLabel}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Hora</td>
            <td style="padding: 6px 0; color: #0f172a; font-size: 16px; font-weight: 700;">${hora}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Fecha</td>
            <td style="padding: 6px 0; color: #0f172a; text-transform: capitalize;">${fecha}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Distancia</td>
            <td style="padding: 6px 0; color: #d97706; font-weight: 700;">${data.geoDistanciaM != null ? `${data.geoDistanciaM}m` : "N/A"} (máx. ${data.geoRadiusM}m)</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Coordenadas</td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace; font-size: 11px;">${gpsCoords}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Dispositivo</td>
            <td style="padding: 6px 0; color: #0f172a;">${deviceDisplay}</td>
          </tr>
        </table>
      </div>
      ${mapSection}
      <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; font-size: 10px; margin: 0;">
          ${EMAIL_CONFIG.companyName} — Notificación automática de marcación fuera de rango
        </p>
        <p style="color: #94a3b8; font-size: 10px; margin: 8px 0 0;">
          ¿No quieres recibir este tipo de alertas?
          <a href="${prefsUrl}" style="color:#0ea5e9;text-decoration:underline">Administrar notificaciones</a>
        </p>
      </div>
    </div>
  `;

  // Enviar a todos los destinatarios configurados en paralelo
  await Promise.allSettled(
    recipientEmails.map((email) =>
      resend.emails.send({
        from: EMAIL_CONFIG.from,
        to: email,
        subject,
        html,
      })
    )
  );
}

async function resolveSupervisorEmails(params: {
  tenantId: string;
  installationId: string;
  includeSupervisors: boolean;
  extraUserIds: string[];
}): Promise<string[]> {
  const [assignments, extraUsers] = await Promise.all([
    params.includeSupervisors
      ? prisma.opsAsignacionSupervisor.findMany({
          where: { installationId: params.installationId, isActive: true },
          select: { supervisor: { select: { email: true } } },
        })
      : Promise.resolve([]),
    params.extraUserIds.length > 0
      ? prisma.admin.findMany({
          where: {
            tenantId: params.tenantId,
            status: "active",
            id: { in: params.extraUserIds },
          },
          select: { email: true },
        })
      : Promise.resolve([]),
  ]);
  return Array.from(
    new Set(
      [
        ...assignments.map((a) => a.supervisor.email),
        ...extraUsers.map((u) => u.email),
      ]
        .filter((email): email is string => Boolean(email))
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

/** Alerta al empleador cuando la marca se registra sin correo personal del trabajador (Art. 12). */
export async function sendAlertaGuardiaSinCorreoPersonal(data: {
  tenantId: string;
  installationId: string;
  installationName: string;
  guardiaName: string;
  guardiaRut: string;
  tipo: "entrada" | "salida";
  timestamp: Date;
  hashIntegridad: string;
  employerEmails: string[];
}): Promise<void> {
  const recipients = Array.from(
    new Set(data.employerEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  );
  if (recipients.length === 0) {
    const extra = await resolveSupervisorEmails({
      tenantId: data.tenantId,
      installationId: data.installationId,
      includeSupervisors: true,
      extraUserIds: [],
    });
    recipients.push(...extra);
  }
  if (recipients.length === 0) return;

  const fecha = formatFechaComprobante(data.timestamp);
  const hora = formatHoraComprobante(data.timestamp);
  const subject = `Alerta: marcación sin correo personal — ${data.guardiaName}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 18px; color: #0f172a;">Marcación sin correo personal</h2>
      <p style="font-size: 13px; color: #334155; line-height: 1.5;">
        Se registró una marca de <strong>${data.tipo}</strong> de
        <strong>${escapeHtml(data.guardiaName)}</strong> (RUT ${escapeHtml(formatRutComprobante(data.guardiaRut))})
        en ${escapeHtml(data.installationName)} el ${fecha} a las ${hora}, pero el trabajador
        no tiene correo personal. El comprobante queda disponible en el portal del guardia.
      </p>
      <p style="font-size: 12px; font-family: monospace; color: #64748b; word-break: break-all;">
        Hash: ${escapeHtml(data.hashIntegridad)}
      </p>
    </div>
  `;
  await Promise.allSettled(
    recipients.map((to) =>
      resend.emails.send({ from: PLATFORM_DEFAULT_EMAIL_FROM, to, subject, html }),
    ),
  );
}

export async function sendAlertaFaltaMarcacion(data: {
  guardiaEmail?: string | null;
  employerEmails: string[];
  guardiaName: string;
  guardiaRut: string;
  installationName: string;
  tipo: "entrada" | "salida";
  horaPactada: string;
  fecha: string;
}): Promise<void> {
  const tipoLabel = data.tipo === "entrada" ? "entrada" : "término";
  const subject = `Alerta: falta de marcación de ${tipoLabel} — ${data.guardiaName}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 18px; color: #0f172a;">Falta de marcación (Art. 45.1)</h2>
      <p style="font-size: 13px; color: #334155; line-height: 1.5;">
        No se registró la marca de <strong>${tipoLabel}</strong> de
        <strong>${escapeHtml(data.guardiaName)}</strong> (RUT ${escapeHtml(formatRutComprobante(data.guardiaRut))})
        en ${escapeHtml(data.installationName)} el ${escapeHtml(data.fecha)}
        a los 30 minutos de la hora pactada (${escapeHtml(data.horaPactada)}).
      </p>
    </div>
  `;
  const to = data.guardiaEmail?.trim();
  const toNorm = to?.toLowerCase() ?? "";
  const cc = Array.from(
    new Set(
      data.employerEmails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e && e !== toNorm),
    ),
  );
  if (to) {
    await resend.emails.send({
      from: PLATFORM_DEFAULT_EMAIL_FROM,
      to,
      ...(cc.length > 0 ? { cc } : {}),
      subject,
      html,
    });
    return;
  }
  if (cc.length === 0) return;
  await Promise.allSettled(
    cc.map((email) =>
      resend.emails.send({ from: PLATFORM_DEFAULT_EMAIL_FROM, to: email, subject, html }),
    ),
  );
}

export async function sendCambioCorreoPersonal(data: {
  to: string;
  guardiaName: string;
  previousEmail?: string | null;
  newEmail: string;
  when: Date;
  kind: "confirmacion_nuevo" | "aviso_anterior";
}): Promise<void> {
  const fecha = `${formatFechaComprobante(data.when)} ${formatHoraComprobante(data.when)}`;
  const isNew = data.kind === "confirmacion_nuevo";
  const subject = isNew
    ? "Confirmación de correo personal — Portal Guardia"
    : "Aviso: tu correo personal fue actualizado — Portal Guardia";
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 18px;">Cambio de correo personal</h2>
      <p style="font-size: 13px; line-height: 1.5;">
        ${escapeHtml(data.guardiaName)}, el ${fecha} se ${isNew ? "confirmó" : "solicitó"} el cambio
        de correo personal ${data.previousEmail ? `desde ${escapeHtml(data.previousEmail)} ` : ""}
        hacia <strong>${escapeHtml(data.newEmail)}</strong>.
      </p>
    </div>
  `;
  await resend.emails.send({ from: PLATFORM_DEFAULT_EMAIL_FROM, to: data.to, subject, html });
}

export async function sendCambioPinGuardia(data: {
  to: string;
  guardiaName: string;
  when: Date;
  success: boolean;
}): Promise<void> {
  const fecha = `${formatFechaComprobante(data.when)} ${formatHoraComprobante(data.when)}`;
  const subject = data.success
    ? "PIN de marcación actualizado"
    : "Intento de cambio de PIN";
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 18px;">Cambio de PIN</h2>
      <p style="font-size: 13px; line-height: 1.5;">
        ${escapeHtml(data.guardiaName)}, el ${fecha} el cambio de PIN
        ${data.success ? "se realizó correctamente" : "no pudo completarse"}.
        Si no fuiste tú, contacta a tu supervisor.
      </p>
    </div>
  `;
  await resend.emails.send({ from: PLATFORM_DEFAULT_EMAIL_FROM, to: data.to, subject, html });
}

/** Notifica a supervisores cuando la marca queda sin GPS (Art. 38/53). */
export async function sendNotificacionSinGps(data: NotificacionFueraDeRango): Promise<void> {
  const marcacionConfigSetting = await prisma.setting.findFirst({
    where: { key: `marcacion_config:${data.tenantId}` },
    select: { value: true },
  });
  const marcacionConfig = parseMarcacionConfigValue(marcacionConfigSetting?.value);
  if (!marcacionConfig.emailAlertaFueraRangoEnabled) return;

  const recipientEmails = await resolveSupervisorEmails({
    tenantId: data.tenantId,
    installationId: data.installationId,
    includeSupervisors: marcacionConfig.emailAlertaFueraRangoIncludeSupervisors,
    extraUserIds: marcacionConfig.emailAlertaFueraRangoUserIds,
  });
  if (recipientEmails.length === 0) return;

  const tipoLabel = data.tipo === "entrada" ? "Entrada" : "Salida";
  const hora = formatHoraComprobante(data.timestamp);
  const fecha = formatFechaComprobante(data.timestamp);
  const subject = `Alerta: Marcación sin GPS — ${data.guardiaName} — ${data.installationName}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 18px;">Marcación sin ubicación GPS</h2>
      <p style="font-size: 13px; line-height: 1.5;">
        <strong>${escapeHtml(data.guardiaName)}</strong> (RUT ${escapeHtml(formatRutComprobante(data.guardiaRut))})
        registró ${tipoLabel} en ${escapeHtml(data.installationName)} el ${fecha} a las ${hora}
        sin coordenadas GPS. La marca es válida (Art. 38/53).
      </p>
      <p style="font-size: 12px; color: #64748b;">Dispositivo: ${escapeHtml(data.deviceDisplay ?? "No especificado")}</p>
    </div>
  `;
  await Promise.allSettled(
    recipientEmails.map((email) =>
      resend.emails.send({ from: PLATFORM_DEFAULT_EMAIL_FROM, to: email, subject, html }),
    ),
  );
}
