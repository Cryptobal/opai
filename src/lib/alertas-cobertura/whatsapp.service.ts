/**
 * Alertas de Cobertura — WhatsApp Service (Twilio)
 *
 * Envía alertas de turno extra via WhatsApp.
 * Estrategia: Content Template si está configurado, sino texto plano.
 */

import Twilio from "twilio";

// IMPORTANTE: leer estas env vars vía getters — NO a nivel de módulo, porque en
// Vercel las funciones cold-started a veces no las tienen aún al momento del
// import. Leer on-demand evita el problema.
//
// CRÍTICO: hacer .trim() — Vercel a veces guarda env vars con \n al final
// (especialmente si se pegaron desde un archivo o si se agregaron con `vercel
// env add < file`). Un \n invisible en TWILIO_WHATSAPP_CONTENT_SID causaba
// error 20422 "Invalid Parameter" en TODOS los envíos via template.
function trimEnv(v: string | undefined): string | undefined {
  return v?.trim() || undefined;
}
function accountSid() { return trimEnv(process.env.TWILIO_ACCOUNT_SID); }
function authToken() { return trimEnv(process.env.TWILIO_AUTH_TOKEN); }
function fromNumber() { return trimEnv(process.env.TWILIO_WHATSAPP_FROM); }
function contentSid() { return trimEnv(process.env.TWILIO_WHATSAPP_CONTENT_SID); }
function messagingServiceSid() { return trimEnv(process.env.TWILIO_MESSAGING_SERVICE_SID); }

const SITE_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "";

let twilioClient: Twilio.Twilio | null = null;

function getClient(): Twilio.Twilio | null {
  const sid = accountSid();
  const token = authToken();
  if (!sid || !token) {
    console.warn("[WhatsApp] Twilio credentials not configured (missing ACCOUNT_SID or AUTH_TOKEN)");
    return null;
  }
  if (!twilioClient) {
    twilioClient = Twilio(sid, token);
  }
  return twilioClient;
}

interface EnviarAlertaWhatsAppParams {
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
  const client = getClient();
  const from = fromNumber();
  const tmplSid = contentSid();
  const msSid = messagingServiceSid();

  if (!client || (!from && !msSid)) {
    console.warn("[WhatsApp] Twilio not configured — skipping", {
      hasClient: !!client,
      hasFrom: !!from,
      hasMessagingService: !!msSid,
      hasContentSid: !!tmplSid,
    });
    return { success: false, error: "Twilio not configured" };
  }

  const telefonoNormalizado = normalizarTelefonoChileno(params.telefono);
  if (!telefonoNormalizado) {
    console.warn(`[WhatsApp] Teléfono inválido: ${params.telefono}`);
    return { success: false, error: "Teléfono inválido" };
  }

  const to = `whatsapp:${telefonoNormalizado}`;

  // Log inicial — diagnostica qué estrategia se intentará
  console.log(`[WhatsApp] Enviando a ${telefonoNormalizado} — estrategia: ${tmplSid ? "template" : "freeform"}`);

  // Estrategia 1: Content Template (si está configurado y aprobado)
  if (tmplSid) {
    try {
      // Template alerta_turno_extra (UTILITY, 7 vars):
      //   {{1}} = JWT token (button URL: /alerta/t/{{1}})
      //   {{2}} = Instalación, {{3}} = Dirección
      //   {{4}} = Horario, {{5}} = Monto, {{6}} = Modalidad, {{7}} = Funciones
      const buttonToken = params.urlPath.includes("?token=")
        ? params.urlPath.split("?token=")[1]
        : params.urlPath;

      // Si hay Messaging Service, lo usamos (recomendado por Twilio para
      // Content templates). Sino, fallback a `from` directo.
      const sendParams: Parameters<typeof client.messages.create>[0] = {
        to,
        contentSid: tmplSid,
        contentVariables: JSON.stringify({
          "1": buttonToken.substring(0, 500),
          "2": params.instalacion.substring(0, 200),
          "3": params.direccion.substring(0, 200),
          "4": params.horario.substring(0, 100),
          "5": params.monto.substring(0, 50),
          "6": params.modalidad.substring(0, 100),
          "7": params.funciones.substring(0, 200),
        }),
      };
      if (msSid) {
        sendParams.messagingServiceSid = msSid;
      } else {
        sendParams.from = from!;
      }
      const message = await client.messages.create(sendParams);

      console.log(`[WhatsApp] ✓ Template enviado a ${telefonoNormalizado}: SID=${message.sid}`);
      return { success: true, messageSid: message.sid };
    } catch (templateError: any) {
      // Log detallado del error — MUY importante para diagnosticar
      const code = templateError?.code;
      const status = templateError?.status;
      const message = templateError?.message || String(templateError);
      const moreInfo = templateError?.moreInfo;
      console.error(
        `[WhatsApp] ✗ Template FALLÓ a ${telefonoNormalizado}:`,
        { code, status, message, moreInfo, contentSid: tmplSid?.substring(0, 10) + "..." },
      );
      // NO hacer fallback a freeform — casi siempre fallará con 63016
      // (fuera de la ventana de 24h) y es más claro devolver el error real.
      return {
        success: false,
        error: `Template error ${code}: ${message}`,
      };
    }
  }

  // Estrategia 2: Texto plano (SOLO si no hay template configurado — ej. dev)
  console.warn("[WhatsApp] ⚠ TWILIO_WHATSAPP_CONTENT_SID no configurado — usando freeform (fallará fuera de ventana 24h)");
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

    const fallbackParams: Parameters<typeof client.messages.create>[0] = {
      to,
      body,
    };
    if (msSid) {
      fallbackParams.messagingServiceSid = msSid;
    } else {
      fallbackParams.from = from!;
    }
    const message = await client.messages.create(fallbackParams);

    console.log(`[WhatsApp] ✓ Texto plano enviado a ${telefonoNormalizado}: SID=${message.sid}`);
    return { success: true, messageSid: message.sid };
  } catch (error: any) {
    const code = error?.code;
    const msg = error?.message || String(error);
    console.error(`[WhatsApp] ✗ Error freeform a ${telefonoNormalizado}:`, { code, msg });
    return { success: false, error: `Freeform error ${code}: ${msg}` };
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
  return !!(accountSid() && authToken() && (fromNumber() || messagingServiceSid()));
}
