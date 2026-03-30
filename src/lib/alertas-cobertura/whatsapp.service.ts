/**
 * Alertas de Cobertura — WhatsApp Service (Twilio Content API)
 *
 * Envía alertas de turno extra via WhatsApp usando Content Templates API de Twilio.
 * Template: "alerta_turno_extra" (UTILITY / Call to Action)
 * Body vars: {{1}}-{{5}} (instalación, horario, monto, modalidad, funciones)
 * Button URL var: {{1}} suffix para link de aceptación
 */

import Twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID;

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
  if (!client || !fromNumber || !contentSid) {
    console.warn("[WhatsApp] Twilio not configured, skipping");
    return { success: false, error: "Twilio not configured" };
  }

  const telefonoNormalizado = normalizarTelefonoChileno(params.telefono);
  if (!telefonoNormalizado) {
    console.warn(`[WhatsApp] Teléfono inválido: ${params.telefono}`);
    return { success: false, error: "Teléfono inválido" };
  }

  try {
    const message = await client.messages.create({
      from: fromNumber,
      to: `whatsapp:${telefonoNormalizado}`,
      contentSid,
      contentVariables: JSON.stringify({
        "1": params.instalacion.substring(0, 200),
        "2": params.horario.substring(0, 100),
        "3": params.monto.substring(0, 50),
        "4": params.modalidad.substring(0, 100),
        "5": params.funciones.substring(0, 200),
      }),
    });

    console.log(
      `[WhatsApp] Enviado a ${telefonoNormalizado}: SID=${message.sid}, Status=${message.status}`,
    );
    return { success: true, messageSid: message.sid };
  } catch (error: any) {
    console.error(
      `[WhatsApp] Error enviando a ${telefonoNormalizado}:`,
      error?.message || error,
    );
    return { success: false, error: error?.message || "Error desconocido" };
  }
}

/**
 * Normaliza teléfono chileno a formato E.164 (+56XXXXXXXXX).
 * Soporta: +56912345678, 56912345678, 912345678, 12345678
 * También acepta formatos internacionales con +.
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
  return !!(accountSid && authToken && fromNumber && contentSid);
}
