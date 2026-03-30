/**
 * Alertas de Cobertura — WhatsApp Service (Twilio)
 *
 * Envía alertas de turno extra via WhatsApp.
 * Estrategia: Content Template si está configurado, sino texto plano.
 */

import Twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID; // Optional

const SITE_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://opai.gard.cl";

let twilioClient: Twilio.Twilio | null = null;

function getClient(): Twilio.Twilio | null {
  if (!accountSid || !authToken) {
    console.warn("[WhatsApp] Twilio credentials not configured");
    return null;
  }
  if (!twilioClient) {
    twilioClient = Twilio(accountSid, authToken);
  }
  return twilioClient;
}

interface EnviarAlertaWhatsAppParams {
  telefono: string;
  instalacion: string;
  horario: string;
  monto: string;
  modalidad: string;
  funciones: string;
  urlPath: string;
}

export async function enviarAlertaWhatsApp(
  params: EnviarAlertaWhatsAppParams,
): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  const client = getClient();
  if (!client || !fromNumber) {
    console.warn("[WhatsApp] Twilio not configured, skipping");
    return { success: false, error: "Twilio not configured" };
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
      const message = await client.messages.create({
        from: fromNumber,
        to,
        contentSid,
        contentVariables: JSON.stringify({
          "1": params.instalacion.substring(0, 200),
          "2": params.horario.substring(0, 100),
          "3": params.monto.substring(0, 50),
          "4": params.modalidad.substring(0, 100),
          "5": params.funciones.substring(0, 200),
        }),
      });

      console.log(`[WhatsApp] Template enviado a ${telefonoNormalizado}: SID=${message.sid}`);
      return { success: true, messageSid: message.sid };
    } catch (templateError: any) {
      console.warn(`[WhatsApp] Template falló (${templateError?.code || templateError?.message}), intentando texto plano...`);
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
  } catch (error: any) {
    console.error(`[WhatsApp] Error enviando a ${telefonoNormalizado}:`, error?.message || error);
    return { success: false, error: error?.message || "Error desconocido" };
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
  return !!(accountSid && authToken && fromNumber);
}
