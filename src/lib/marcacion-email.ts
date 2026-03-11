/**
 * Envío de comprobante de marcación por email.
 * 
 * Requisito Resolución Exenta N°38:
 * El trabajador debe poder acceder a sus registros de asistencia.
 * El comprobante por email complementa el acceso vía web.
 */

import { resend, EMAIL_CONFIG } from "@/lib/resend";

interface ComprobanteMarcacion {
  guardiaName: string;
  guardiaEmail?: string;
  guardiaRut: string;
  installationName: string;
  tipo: "entrada" | "salida";
  timestamp: Date;
  geoValidada: boolean;
  geoDistanciaM: number | null;
  gpsStatus: "dentro_rango" | "fuera_rango" | "sin_gps";
  hashIntegridad: string;
  lat: number | null;
  lng: number | null;
}

/**
 * Envía un comprobante de marcación por email al guardia.
 * Solo envía si el guardia tiene email configurado.
 * Es fire-and-forget — no bloquea el flujo de marcación.
 */
export async function sendMarcacionComprobante(data: ComprobanteMarcacion): Promise<void> {
  if (!data.guardiaEmail) return; // Sin email, no enviar

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
  const geoStatusLabel =
    data.gpsStatus === "dentro_rango"
      ? `Ubicación validada (${data.geoDistanciaM}m)`
      : data.gpsStatus === "fuera_rango"
      ? `Fuera de rango (${data.geoDistanciaM}m)`
      : "Sin geolocalización";
  const geoStatusColor =
    data.gpsStatus === "dentro_rango" ? "#059669"
      : data.gpsStatus === "fuera_rango" ? "#d97706"  // amarillo/naranja — es info, no error
      : "#94a3b8";
  const gpsCoords = data.lat != null && data.lng != null
    ? `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}`
    : null;

  const subject = `Comprobante de ${tipoLabel} — ${data.installationName} — ${hora}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; background: #2563eb; border-radius: 50%; line-height: 48px; text-align: center;">
          <span style="color: white; font-size: 20px;">${data.tipo === "entrada" ? "→" : "←"}</span>
        </div>
        <h2 style="margin: 12px 0 4px; color: #0f172a; font-size: 18px;">${tipoLabel} Registrada</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Comprobante de marcación de asistencia</p>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 120px;">Guardia</td>
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
            <td style="padding: 6px 0; color: #64748b;">Ubicación</td>
            <td style="padding: 6px 0; color: ${geoStatusColor};">${geoStatusLabel}</td>
          </tr>${gpsCoords ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Coordenadas</td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace; font-size: 11px;">${gpsCoords}</td>
          </tr>` : ""}
        </table>
      </div>

      <div style="background: #f1f5f9; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <p style="color: #64748b; font-size: 10px; margin: 0 0 4px;">Hash de integridad (SHA-256)</p>
        <p style="color: #475569; font-size: 10px; font-family: monospace; word-break: break-all; margin: 0;">${data.hashIntegridad}</p>
      </div>

      <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; font-size: 10px; margin: 0;">
          ${EMAIL_CONFIG.companyName} — Registro conforme a Res. Exenta N°38, DT Chile
        </p>
        <p style="color: #94a3b8; font-size: 10px; margin: 4px 0 0;">
          Sello de tiempo de la marca: ${data.timestamp.toISOString()}
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
