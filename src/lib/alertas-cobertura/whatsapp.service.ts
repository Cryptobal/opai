/**
 * Alertas de Cobertura — WhatsApp Service (Twilio)
 *
 * Envía alertas de turno extra via WhatsApp.
 * Estrategia: Content Template si está configurado, sino texto plano.
 * Una sola cuenta Twilio; remitente y template opcional por tenant (getTenantTwilioConfig).
 */

import {
  getTenantTwilioConfig,
  isTenantWhatsAppSendConfigured,
} from "@/lib/twilio-config";

const SITE_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "";

interface EnviarAlertaWhatsAppParams {
  tenantId: string;
  telefono: string;
  instalacion: string;
  direccion: string;
  horario: string;
  monto: string;
  modalidad: string;
  funciones: string;
  urlPath: string;
}

export async function enviarAlertaWhatsApp(
  params: EnviarAlertaWhatsAppParams,
): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  const twilio = await getTenantTwilioConfig(params.tenantId);
  const client = twilio.client;
  const fromNumber = twilio.from;
  const contentSid = twilio.contentSid;

  if (!client || !fromNumber) {
    console.warn("[WhatsApp] Twilio not configured, skipping");
    return { success: false, error: "Twilio not configured" };
  }

  if (!twilio.enabled) {
    console.warn("[WhatsApp] WhatsApp disabled for tenant, skipping");
    return { success: false, error: "WhatsApp desactivado para el tenant" };
  }

  const telefonoNormalizado = normalizarTelefonoChileno(params.telefono);
  if (!telefonoNormalizado) {
    console.warn(`[WhatsApp] Teléfono inválido: ${params.telefono}`);
    return { success: false, error: "Teléfono inválido" };
  }

  const to = `whatsapp:${telefonoNormalizado}`;

  // Estrategia 1: Content Template (si está configurado y aprobado)
  if (contentSid) {
    try {
      const buttonToken = params.urlPath.includes("?token=")
        ? params.urlPath.split("?token=")[1]
        : params.urlPath;

      const message = await client.messages.create({
        from: fromNumber,
        to,
        contentSid,
        contentVariables: JSON.stringify({
          "1": buttonToken.substring(0, 500),
          "2": params.instalacion.substring(0, 200),
          "3": params.direccion.substring(0, 200),
          "4": params.horario.substring(0, 100),
          "5": params.monto.substring(0, 50),
          "6": params.modalidad.substring(0, 100),
          "7": params.funciones.substring(0, 200),
        }),
      });

      console.log(`[WhatsApp] Template enviado a ${telefonoNormalizado}: SID=${message.sid}`);
      return { success: true, messageSid: message.sid };
    } catch (templateError: unknown) {
      const code =
        templateError && typeof templateError === "object" && "code" in templateError
          ? String((templateError as { code?: unknown }).code)
          : "";
      const msg =
        templateError instanceof Error ? templateError.message : String(templateError);
      console.warn(`[WhatsApp] Template falló (${code || msg}), intentando texto plano...`);
      // Fall through to plain text
    }
  }

  // Estrategia 2: Texto plano con link
  try {
    const linkAceptar = `${SITE_URL}/alerta/${params.urlPath}`;
    const body = [
      "⚠️ *TURNO EXTRA DISPONIBLE*",
      "",
      `📍 ${params.instalacion}`,
      `📌 ${params.direccion}`,
      `📅 ${params.horario}`,
      `💰 ${params.monto}`,
      `🛡️ ${params.modalidad}`,
      "",
      params.funciones,
      "",
      `👉 Aceptar turno: ${linkAceptar}`,
    ].join("\n");

    const message = await client.messages.create({
      from: fromNumber,
      to,
      body,
    });

    console.log(`[WhatsApp] Texto plano enviado a ${telefonoNormalizado}: SID=${message.sid}`);
    return { success: true, messageSid: message.sid };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error(`[WhatsApp] Error enviando a ${telefonoNormalizado}:`, msg);
    return { success: false, error: msg };
  }
}

/**
 * Normaliza teléfono chileno a formato E.164 (+56XXXXXXXXX).
 */
function normalizarTelefonoChileno(telefono: string): string | null {
  if (!telefono) return null;

  let limpio = telefono.replace(/[\s\-\(\)\.]/g, "");

  if (limpio.startsWith("+56") && limpio.length === 12) return limpio;
  if (limpio.startsWith("56") && limpio.length === 11) return `+${limpio}`;
  if (limpio.startsWith("9") && limpio.length === 9) return `+56${limpio}`;
  if (limpio.length === 8 && !limpio.startsWith("0")) return `+569${limpio}`;
  if (limpio.startsWith("+") && limpio.length >= 10) return limpio;

  console.warn(`[WhatsApp] No se pudo normalizar teléfono: ${telefono}`);
  return null;
}

export function isWhatsAppConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  );
}

export { isTenantWhatsAppSendConfigured };
