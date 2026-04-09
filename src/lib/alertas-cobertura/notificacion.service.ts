/**
 * Alertas de Cobertura — Notification Service
 *
 * Centraliza TODOS los envíos de notificación del módulo de alertas.
 * Se llama desde: crear alerta, cron escalar, aceptación, confirmación.
 *
 * Canales: Push (portal guardia), Email (Resend), WhatsApp (Twilio), Chat sistema, Bell, Pusher real-time.
 */

import { prisma } from "@/lib/prisma";
import { sendPushToPortalUser, sendPushToSpecificAdmins } from "@/lib/pwa/push-service";
import { sendSystemChatMessage } from "@/lib/chat-system-message";
import { getPusherServer } from "@/lib/chat";
import { sendNotificationToUser } from "@/lib/notification-service";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { render } from "@react-email/render";
import AlertaCoberturaEmail from "@/emails/AlertaCoberturaEmail";
import AlertaAceptadaEmail from "@/emails/AlertaAceptadaEmail";
import { generarTokenExterno } from "@/lib/alertas-cobertura/token.service";
import { getAlertaCoberturaConfig } from "@/lib/alertas-cobertura/config";
import { enviarAlertaWhatsApp, isWhatsAppConfigured } from "@/lib/alertas-cobertura/whatsapp.service";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";

const TZ = "America/Santiago";
// IMPORTANTE: en Vercel prod no existe NEXTAUTH_URL ni NEXT_PUBLIC_SITE_URL.
// Los env vars disponibles son SITE_URL, NEXT_PUBLIC_APP_URL y NEXT_PUBLIC_BASE_URL.
// Si ninguno está disponible, fallback a opai.gard.cl en producción.
// Sin esto, los emails quedaban con URLs relativas ("/ops/...") que Gmail
// interpretaba como "http://ops/..." (inválido).
const SITE_URL = (
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  "https://opai.gard.cl"
).replace(/\/$/, "");

// ======================================
// 1. NOTIFICAR GUARDIA — Nueva alerta disponible
// ======================================

export async function notificarGuardiaAlerta(params: {
  tenantId: string;
  guardiaId: string;
  personaId: string;
  alertaId: string;
  esInterno: boolean;
  oleadaNumero: number;
  instalacionNombre: string;
  instalacionDireccion: string;
  fechaInicio: Date;
  fechaFin: Date;
  montoOfrecido: number;
  funciones: string;
  urgencia: string | null;
  tiempoRestanteOleadaMin: number;
  modalidad?: string;
}): Promise<{ push: boolean; email: boolean; whatsapp: boolean }> {
  const resultado = { push: false, email: false, whatsapp: false };
  const errores: Record<string, string> = {};

  // Título varía según audiencia: para contratados (interno) es "Cobertura",
  // para pool externo con turnos extra es "Turno Extra".
  const tituloBase = params.esInterno ? "Cobertura Requerida" : "Turno Extra Disponible";
  const tituloUrgente = params.esInterno ? "COBERTURA URGENTE" : "TURNO EXTRA URGENTE";
  const titulo = params.urgencia === "URGENTE"
    ? `\uD83D\uDEA8 ${tituloUrgente}`
    : `\u26A0\uFE0F ${tituloBase}`;

  const montoFormateado = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(params.montoOfrecido);

  const horario = formatearRangoHorario(params.fechaInicio, params.fechaFin);
  const cuerpo = `${params.instalacionNombre}\n${horario}\n${montoFormateado}`;

  // Resolver config y canales habilitados
  const config = await getAlertaCoberturaConfig(params.tenantId);
  const canalesConfig = params.esInterno ? config.canalInternoDefault : config.canalExternoDefault;

  // Cargar persona una sola vez (email + phone + nombre)
  const persona = await prisma.opsPersona.findUnique({
    where: { id: params.personaId },
    select: { email: true, personalEmail: true, firstName: true, phone: true, phoneMobile: true },
  });

  // Priorizar phoneMobile (celular) sobre phone (fijo). El perfil UI muestra phoneMobile
  // como "CELULAR", así que ahí es donde usualmente están los números de WhatsApp.
  const telefonoContacto = persona?.phoneMobile || persona?.phone || null;

  // Token externo: lo generamos SIEMPRE (interno o externo). El template de
  // WhatsApp usa una URL CTA `https://opai.gard.cl/alerta/t/{{1}}` donde {{1}}
  // debe ser un JWT válido para que la route handler /alerta/t/[token] decodifique
  // el alertaId y redirija a la página de aceptación. Sin token, el redirect cae
  // en /alerta/invalid (lo que estaba pasando con guardias internos).
  let tokenExterno: string | null = null;
  try {
    tokenExterno = await generarTokenExterno(params.alertaId, params.guardiaId);
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Error generando token externo:", e);
  }

  // Link de aceptación para email/push:
  //  - Interno (con token): la landing pública sirve igual que para externos
  //  - Sin token (fallback): portal del guardia
  const linkAceptar = tokenExterno
    ? `/alerta/${params.alertaId}?token=${tokenExterno}`
    : `/portal/guardia?section=alertas-cobertura`;

  // === PUSH (guardias internos con suscripción al portal guardia) ===
  if (params.esInterno && canalesConfig.includes("PUSH")) {
    try {
      await sendPushToPortalUser({
        tenantId: params.tenantId,
        notifKey: "alerta_cobertura",
        userType: "guardia",
        userId: params.guardiaId,
        portalType: "guardia",
        title: titulo,
        body: cuerpo,
        url: linkAceptar,
        tag: `alerta-cobertura-${params.alertaId}`,
      });
      resultado.push = true;
    } catch (e: any) {
      errores.PUSH = e?.message || "Error desconocido";
      console.error("[AlertaCobertura:Notif] Push error:", e);
    }
  }

  // === EMAIL ===
  if (canalesConfig.includes("EMAIL")) {
    try {
      const emailDestino = persona?.personalEmail || persona?.email;
      if (emailDestino) {
        const emailConfig = await getTenantEmailConfig(params.tenantId);
        const html = await render(
          AlertaCoberturaEmail({
            nombre: persona.firstName ?? "Guardia",
            instalacion: params.instalacionNombre,
            direccion: params.instalacionDireccion,
            horario,
            monto: montoFormateado,
            funciones: params.funciones,
            urgencia: params.urgencia,
            linkAceptar: `${SITE_URL}${linkAceptar}`,
            esInterno: params.esInterno,
            tiempoRestanteMin: params.tiempoRestanteOleadaMin,
            logoUrl: emailConfig.logoUrl,
            companyName: emailConfig.companyName,
          }),
        );

        await resend.emails.send({
          from: emailConfig.from,
          replyTo: emailConfig.replyTo,
          to: emailDestino,
          subject: titulo,
          html,
          // Sin tracking de clicks — Resend los reescribe a un subdominio
          // resend-links.com sin SSL válido, rompiendo los botones CTA.
          headers: { "X-Entity-Ref-ID": params.alertaId },
          // @ts-ignore SDK tipos no exponen esto en todas las versiones
          clickTracking: false,
          openTracking: false,
        });
        resultado.email = true;
      } else {
        errores.EMAIL = "Sin email registrado";
      }
    } catch (e: any) {
      errores.EMAIL = e?.message || "Error desconocido";
      console.error("[AlertaCobertura:Notif] Email error:", e);
    }
  }

  // === WHATSAPP (Twilio Content API) ===
  if (canalesConfig.includes("WHATSAPP")) {
    if (!isWhatsAppConfigured()) {
      errores.WHATSAPP = "Twilio no configurado";
    } else {
      try {
        if (telefonoContacto) {
          // El botón del template usa /alerta/t/{{1}} donde {{1}} es un JWT.
          // Reusamos el tokenExterno generado arriba (interno o externo).
          // Si falla la generación, usamos el alertaId — fallará el redirect
          // pero al menos el WhatsApp se manda y el guardia ve el contenido.
          const urlPath = tokenExterno || params.alertaId;

          const waResult = await enviarAlertaWhatsApp({
            telefono: telefonoContacto,
            instalacion: params.instalacionNombre,
            direccion: params.instalacionDireccion,
            horario,
            monto: montoFormateado,
            modalidad: mapearModalidadLabel(params.modalidad || "GGSS"),
            funciones: params.funciones || "Turno de cobertura",
            urlPath,
          });

          if (waResult.success) {
            resultado.whatsapp = true;
          } else {
            errores.WHATSAPP = waResult.error || "Error de envío";
          }
        } else {
          errores.WHATSAPP = "Sin teléfono registrado";
        }
      } catch (e: any) {
        errores.WHATSAPP = e?.message || "Error desconocido";
        console.error("[AlertaCobertura:Notif] WhatsApp error:", e);
      }
    }
  }

  // === REGISTRAR en DB — SIEMPRE registrar al menos un intento por guardia ===
  const canalesIntentados = canalesConfig.filter((c: string) =>
    (c === "PUSH" && params.esInterno) || c === "EMAIL" || c === "WHATSAPP",
  );

  if (canalesIntentados.length > 0) {
    for (const canal of canalesIntentados) {
      const exito = (canal === "PUSH" && resultado.push) ||
        (canal === "EMAIL" && resultado.email) ||
        (canal === "WHATSAPP" && resultado.whatsapp);

      await prisma.opsAlertaNotificacion.create({
        data: {
          alertaId: params.alertaId,
          guardiaId: params.guardiaId,
          oleadaNumero: params.oleadaNumero,
          canal,
          entregada: exito,
          errorDetalle: errores[canal] || null,
        },
      }).catch((e: unknown) => console.error("[AlertaCobertura:Notif] DB log error:", e));
    }
  } else {
    // Si no hubo canales disponibles, registrar de todas formas para visibilidad
    await prisma.opsAlertaNotificacion.create({
      data: {
        alertaId: params.alertaId,
        guardiaId: params.guardiaId,
        oleadaNumero: params.oleadaNumero,
        canal: "NINGUNO",
        entregada: false,
        errorDetalle: "Sin canales de notificación habilitados para este guardia",
      },
    }).catch((e: unknown) => console.error("[AlertaCobertura:Notif] DB log error:", e));
  }

  return resultado;
}

// ======================================
// 2. NOTIFICAR OLEADA COMPLETA — Batch
// ======================================

export async function notificarOleada(params: {
  tenantId: string;
  alertaId: string;
  oleadaNumero: number;
  guardiaIds: string[];
  esInterno: boolean;
  instalacionNombre: string;
  instalacionDireccion: string;
  /** Null en alertas de modo libre (sin instalación asociada). */
  instalacionId: string | null;
  fechaInicio: Date;
  fechaFin: Date;
  montoOfrecido: number;
  funciones: string;
  urgencia: string | null;
  tiempoRestanteOleadaMin: number;
  modalidad?: string;
}): Promise<{ total: number; exitosas: number; fallidas: number }> {
  let exitosas = 0;
  let fallidas = 0;

  // Obtener datos de todos los guardias de la oleada
  const guardias = await prisma.opsGuardia.findMany({
    where: { id: { in: params.guardiaIds } },
    select: {
      id: true,
      persona: {
        select: { id: true, email: true, personalEmail: true, phone: true, phoneMobile: true, firstName: true, lastName: true },
      },
    },
  });

  for (const guardia of guardias) {
    try {
      await notificarGuardiaAlerta({
        tenantId: params.tenantId,
        guardiaId: guardia.id,
        personaId: guardia.persona.id,
        alertaId: params.alertaId,
        esInterno: params.esInterno,
        oleadaNumero: params.oleadaNumero,
        instalacionNombre: params.instalacionNombre,
        instalacionDireccion: params.instalacionDireccion,
        fechaInicio: params.fechaInicio,
        fechaFin: params.fechaFin,
        montoOfrecido: params.montoOfrecido,
        funciones: params.funciones,
        urgencia: params.urgencia,
        tiempoRestanteOleadaMin: params.tiempoRestanteOleadaMin,
        modalidad: params.modalidad,
      });
      exitosas++;
    } catch (e) {
      console.error(`[AlertaCobertura:Notif] Error notificando guardia ${guardia.id}:`, e);
      fallidas++;
    }
  }

  // === CHAT DE INSTALACIÓN === (solo en modo instalación)
  if (params.instalacionId) {
    try {
      const installation = await prisma.crmInstallation.findUnique({
        where: { id: params.instalacionId },
        select: { chatEnabled: true, chatChannels: { select: { id: true }, take: 1 } },
      });

      if (installation?.chatEnabled && installation.chatChannels[0]?.id) {
        const tipoOleada = params.esInterno ? "personal interno" : "pool externo";
        await sendSystemChatMessage({
          tenantId: params.tenantId,
          channelId: installation.chatChannels[0].id,
          content: `\u26A0\uFE0F Alerta de cobertura activada — Oleada ${params.oleadaNumero + 1} (${tipoOleada}): ${params.guardiaIds.length} guardias notificados.${params.urgencia === "URGENTE" ? " \uD83D\uDEA8 URGENTE" : ""}`,
          systemEventType: "alerta_cobertura",
          systemEventData: {
            alertaId: params.alertaId,
            oleadaNumero: params.oleadaNumero,
            guardiaCount: params.guardiaIds.length,
            tipo: params.esInterno ? "INTERNA" : "EXTERNA",
            link: `/ops/alertas-cobertura/${params.alertaId}`,
          },
        });
      }
    } catch (e) {
      console.error("[AlertaCobertura:Notif] Chat error:", e);
    }
  }

  // === PUSHER REAL-TIME (para dashboard supervisor) ===
  try {
    const pusher = getPusherServer();
    await pusher.trigger(`alertas-cobertura-${params.tenantId}`, "oleada-activada", {
      alertaId: params.alertaId,
      oleadaNumero: params.oleadaNumero,
      guardiaCount: params.guardiaIds.length,
      esInterno: params.esInterno,
      exitosas,
      fallidas,
    });
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Pusher error:", e);
  }

  return { total: params.guardiaIds.length, exitosas, fallidas };
}

// ======================================
// 3. NOTIFICAR SUPERVISOR — Guardia aceptó
// ======================================

export async function notificarSupervisorAceptacion(params: {
  tenantId: string;
  alertaId: string;
  /** Null en alertas de modo libre (sin instalación asociada). */
  instalacionId: string | null;
  instalacionNombre: string;
  instalacionDireccion?: string;
  guardiaId: string;
  guardiaNombre: string;
  guardiaPhone: string | null;
  guardiaEmail: string | null;
  distanciaKm: number | null;
  esInterno: boolean;
  creadaPorId: string;
  fechaInicio?: Date;
  fechaFin?: Date;
  montoOfrecido?: number;
  funciones?: string;
}): Promise<void> {
  const linkAlerta = `/ops/alertas-cobertura/${params.alertaId}`;

  // 1. Push al admin que creó la alerta
  try {
    await sendPushToSpecificAdmins(
      params.tenantId,
      [params.creadaPorId],
      "alerta_cobertura_aceptada",
      "Cobertura Resuelta",
      `${params.guardiaNombre} aceptó el turno en ${params.instalacionNombre}`,
      linkAlerta,
    );
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Push supervisor error:", e);
  }

  // 2. Email al admin + (si hay tenant whatsapp configurado) WhatsApp al admin
  //    con los datos de contacto del guardia que aceptó.
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: params.creadaPorId },
      select: { email: true, name: true },
    });
    if (admin?.email) {
      const emailConfig = await getTenantEmailConfig(params.tenantId);
      const html = await render(
        AlertaAceptadaEmail({
          supervisorNombre: admin.name,
          guardiaNombre: params.guardiaNombre,
          guardiaPhone: params.guardiaPhone,
          guardiaEmail: params.guardiaEmail,
          instalacion: params.instalacionNombre,
          direccion: params.instalacionDireccion,
          horario: params.fechaInicio && params.fechaFin
            ? formatearRangoHorario(params.fechaInicio, params.fechaFin)
            : undefined,
          monto: params.montoOfrecido
            ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(params.montoOfrecido)
            : undefined,
          funciones: params.funciones,
          distanciaKm: params.distanciaKm,
          esInterno: params.esInterno,
          linkAlerta: `${SITE_URL}${linkAlerta}`,
          logoUrl: emailConfig.logoUrl,
          companyName: emailConfig.companyName,
        }),
      );

      // Destinatarios: admin creador + emailOps del tenant (si existe y no
      // es el mismo) como CC para que operaciones reciba copia automática.
      const { getTenantCompanyConfig } = await import("@/lib/tenant-config");
      const tenantCfg = await getTenantCompanyConfig(params.tenantId);
      const ccList: string[] = [];
      if (
        tenantCfg.emailOps &&
        tenantCfg.emailOps.includes("@") &&
        tenantCfg.emailOps.toLowerCase() !== admin.email.toLowerCase()
      ) {
        ccList.push(tenantCfg.emailOps);
      }

      await resend.emails.send({
        from: emailConfig.from,
        replyTo: emailConfig.replyTo,
        to: admin.email,
        cc: ccList.length > 0 ? ccList : undefined,
        subject: `✅ Cobertura Resuelta — ${params.guardiaNombre} aceptó turno en ${params.instalacionNombre}`,
        html,
        headers: { "X-Entity-Ref-ID": params.alertaId },
        // @ts-ignore
        clickTracking: false,
        openTracking: false,
      });
    }
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Email supervisor error:", e);
  }

  // 2.5 WhatsApp al admin con los datos de contacto del guardia aceptante.
  //
  // WhatsApp Business requiere un Content Template APROBADO para mensajes
  // outbound fuera de la ventana de 24h. Si TWILIO_WHATSAPP_CONTENT_SID_ACEPTACION
  // no está seteado, NO intentamos mandar (fallará silenciosamente con 63016).
  //
  // Para habilitar: crear template "cobertura_resuelta" en Twilio Console →
  // Messaging → Content Template Builder, en español, con 4 variables:
  //   {{1}} = Nombre del guardia que aceptó
  //   {{2}} = Instalación
  //   {{3}} = Horario
  //   {{4}} = Teléfono del guardia
  // Luego setear TWILIO_WHATSAPP_CONTENT_SID_ACEPTACION=HX... en Vercel env.
  try {
    const { getTenantCompanyConfig } = await import("@/lib/tenant-config");
    const tenantCfg = await getTenantCompanyConfig(params.tenantId);
    const telAdmin = tenantCfg.phoneRaw;
    const tmplAceptSid = process.env.TWILIO_WHATSAPP_CONTENT_SID_ACEPTACION?.trim();

    console.log(
      `[AlertaCobertura:Notif] WhatsApp aceptación — tenant ${params.tenantId}, phoneRaw: ${telAdmin || "(vacío)"}, template: ${tmplAceptSid ? "configurado" : "NO CONFIGURADO"}`,
    );

    if (!telAdmin) {
      console.warn(
        "[AlertaCobertura:Notif] No hay teléfono del tenant configurado (Settings > Empresa > phoneRaw). Saltando WhatsApp al supervisor.",
      );
    } else if (!tmplAceptSid) {
      console.warn(
        "[AlertaCobertura:Notif] TWILIO_WHATSAPP_CONTENT_SID_ACEPTACION no configurado. Crear template 'cobertura_resuelta' en Twilio Console y setear env var. Saltando WhatsApp al supervisor.",
      );
    } else {
      const horarioFmt =
        params.fechaInicio && params.fechaFin
          ? formatearRangoHorario(params.fechaInicio, params.fechaFin)
          : "";

      const { default: Twilio } = await import("twilio");
      const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
      const tok = process.env.TWILIO_AUTH_TOKEN?.trim();
      const msSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
      const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
      if (sid && tok && (msSid || from)) {
        const client = Twilio(sid, tok);
        const normalized = telAdmin.startsWith("+") ? telAdmin : `+${telAdmin}`;
        const createParams: Record<string, string> = {
          to: `whatsapp:${normalized}`,
          contentSid: tmplAceptSid,
          contentVariables: JSON.stringify({
            "1": params.guardiaNombre.substring(0, 100),
            "2": params.instalacionNombre.substring(0, 100),
            "3": horarioFmt.substring(0, 100),
            "4": (params.guardiaPhone || "—").substring(0, 50),
          }),
        };
        if (msSid) {
          createParams.messagingServiceSid = msSid;
        } else {
          createParams.from = from!.startsWith("whatsapp:") ? from! : `whatsapp:${from!}`;
        }
        try {
          const msg = await client.messages.create(createParams as any);
          console.log(
            `[AlertaCobertura:Notif] ✓ WhatsApp aceptación enviado a ${normalized}: SID=${msg.sid}`,
          );
        } catch (twErr: any) {
          console.error(
            "[AlertaCobertura:Notif] ✗ WhatsApp aceptación FALLÓ:",
            { code: twErr?.code, message: twErr?.message, moreInfo: twErr?.moreInfo },
          );
        }
      }
    }
  } catch (e) {
    console.error("[AlertaCobertura:Notif] WhatsApp supervisor error:", e);
  }

  // 3. Chat de instalación (solo modo instalación)
  if (params.instalacionId) {
    try {
      const installation = await prisma.crmInstallation.findUnique({
        where: { id: params.instalacionId },
        select: { chatEnabled: true, chatChannels: { select: { id: true }, take: 1 } },
      });

      if (installation?.chatEnabled && installation.chatChannels[0]?.id) {
        await sendSystemChatMessage({
          tenantId: params.tenantId,
          channelId: installation.chatChannels[0].id,
          content: `\u2705 Cobertura resuelta — ${params.guardiaNombre} aceptó el turno extra.${params.esInterno ? "" : " (Personal externo)"}`,
          systemEventType: "alerta_cobertura_aceptada",
          systemEventData: {
            alertaId: params.alertaId,
            guardiaId: params.guardiaId,
            guardiaNombre: params.guardiaNombre,
          },
        });
      }
    } catch (e) {
      console.error("[AlertaCobertura:Notif] Chat aceptación error:", e);
    }
  }

  // 4. Notificación bell
  try {
    await sendNotificationToUser({
      tenantId: params.tenantId,
      targetUserId: params.creadaPorId,
      type: "alerta_cobertura_aceptada",
      title: "Cobertura Resuelta",
      message: `${params.guardiaNombre} aceptó el turno en ${params.instalacionNombre}`,
      link: linkAlerta,
      data: { alertaId: params.alertaId },
    });
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Bell error:", e);
  }

  // 5. Pusher real-time (dashboard se actualiza)
  try {
    const pusher = getPusherServer();
    await pusher.trigger(`alertas-cobertura-${params.tenantId}`, "alerta-aceptada", {
      alertaId: params.alertaId,
      guardiaId: params.guardiaId,
      guardiaNombre: params.guardiaNombre,
      esInterno: params.esInterno,
    });
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Pusher aceptación error:", e);
  }
}

// ======================================
// 4. NOTIFICAR SUPERVISOR — Confirmación post-turno
// ======================================

export async function notificarSupervisorConfirmacion(params: {
  tenantId: string;
  alertaId: string;
  creadaPorId: string;
  guardiaNombre: string;
  instalacionNombre: string;
}): Promise<void> {
  const linkAlerta = `/ops/alertas-cobertura/${params.alertaId}`;

  // Push
  try {
    await sendPushToSpecificAdmins(
      params.tenantId,
      [params.creadaPorId],
      "alerta_cobertura_confirmar",
      "Confirmación de Cobertura",
      `¿Se presentó ${params.guardiaNombre} al turno en ${params.instalacionNombre}?`,
      linkAlerta,
    );
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Push confirmación error:", e);
  }

  // Bell notification
  try {
    await sendNotificationToUser({
      tenantId: params.tenantId,
      targetUserId: params.creadaPorId,
      type: "alerta_cobertura_confirmar",
      title: "Confirmar Asistencia",
      message: `¿Se presentó ${params.guardiaNombre} al turno en ${params.instalacionNombre}?`,
      link: linkAlerta,
      data: { alertaId: params.alertaId },
    });
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Bell confirmación error:", e);
  }

  // Pusher real-time
  try {
    const pusher = getPusherServer();
    await pusher.trigger(`alertas-cobertura-${params.tenantId}`, "alerta-pendiente-confirmacion", {
      alertaId: params.alertaId,
      guardiaNombre: params.guardiaNombre,
      instalacionNombre: params.instalacionNombre,
    });
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Pusher confirmación error:", e);
  }
}

// ======================================
// 5. NOTIFICAR GUARDIA — Confirmación post-turno
// ======================================

export async function notificarGuardiaConfirmacion(params: {
  tenantId: string;
  guardiaId: string;
  alertaId: string;
  instalacionNombre: string;
  fechaInicio: Date;
  montoOfrecido: number;
  asignacionTipo: string;
}): Promise<void> {
  const mensaje =
    params.asignacionTipo === "AUTOMATICA"
      ? `Tu turno en ${params.instalacionNombre} ha sido confirmado. Ya está registrado en tu pauta.`
      : `Tu turno en ${params.instalacionNombre} ha sido confirmado. El supervisor registrará la asignación.`;

  // Push al guardia
  try {
    await sendPushToPortalUser({
      tenantId: params.tenantId,
      notifKey: "alerta_cobertura_confirmada",
      userType: "guardia",
      userId: params.guardiaId,
      portalType: "guardia",
      title: "✅ Turno Extra Confirmado",
      body: mensaje,
      url: `/portal/guardia?section=alertas-cobertura`,
      tag: `alerta-confirmada-${params.alertaId}`,
    });
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Push guardia confirmación error:", e);
  }

  // Email al guardia
  try {
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: params.guardiaId },
      select: { persona: { select: { email: true, personalEmail: true, firstName: true } } },
    });
    const emailDestino = guardia?.persona?.personalEmail || guardia?.persona?.email;
    if (emailDestino) {
      const emailConfig = await getTenantEmailConfig(params.tenantId);
      const montoFormateado = new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }).format(params.montoOfrecido);

      const horario = formatearRangoHorario(params.fechaInicio, params.fechaInicio); // single date display
      await resend.emails.send({
        from: emailConfig.from,
        replyTo: emailConfig.replyTo,
        to: emailDestino,
        subject: "✅ Turno Extra Confirmado",
        html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <h2 style="color:#059669">✅ Turno Extra Confirmado</h2>
          <p>Hola ${guardia?.persona?.firstName ?? "Guardia"},</p>
          <p>${mensaje}</p>
          <p><strong>Instalación:</strong> ${params.instalacionNombre}</p>
          <p><strong>Monto:</strong> ${montoFormateado}</p>
          <p style="margin-top:20px;color:#6b7280;font-size:12px">OPAI — Sistema de Gestión Operacional</p>
        </div>`,
        // @ts-ignore
        clickTracking: false,
        openTracking: false,
      });
    }
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Email guardia confirmación error:", e);
  }
}

// ======================================
// 6. PUSHER — Eventos genéricos de estado
// ======================================

export async function emitirEventoPusher(
  tenantId: string,
  evento: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const pusher = getPusherServer();
    await pusher.trigger(`alertas-cobertura-${tenantId}`, evento, data);
  } catch (e) {
    console.error(`[AlertaCobertura:Notif] Pusher ${evento} error:`, e);
  }
}

// ======================================
// 7. NOTIFICAR OPERACIONES — Alerta CREADA (email al grupo de ops del tenant)
// ======================================

/**
 * Envía un email al `emailOps` del tenant cuando se crea una nueva alerta
 * de cobertura, para que el equipo de operaciones esté al tanto sin tener
 * que entrar a la plataforma. Es un email de TEXTO simple (no template de
 * React Email) para mantener el payload liviano.
 */
export async function notificarOpsAlertaCreada(params: {
  tenantId: string;
  alertaId: string;
  instalacionNombre: string;
  instalacionDireccion: string;
  fechaInicio: Date;
  fechaFin: Date;
  montoOfrecido: number;
  funciones: string;
  urgencia: string | null;
  creadaPorNombre: string;
  totalGuardias: number;
  oleadasGeneradas: number;
}): Promise<void> {
  try {
    const { getTenantCompanyConfig } = await import("@/lib/tenant-config");
    const tenantCfg = await getTenantCompanyConfig(params.tenantId);
    const emailOps = tenantCfg.emailOps;
    if (!emailOps || !emailOps.includes("@")) {
      console.log(
        `[AlertaCobertura:Notif] emailOps no configurado en tenant ${params.tenantId}, saltando notif a ops.`,
      );
      return;
    }

    const emailConfig = await getTenantEmailConfig(params.tenantId);
    const montoFmt = new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(params.montoOfrecido);
    const horario = formatearRangoHorario(params.fechaInicio, params.fechaFin);
    const linkDetalle = `${SITE_URL}/ops/alertas-cobertura/${params.alertaId}`;
    const urgenciaLabel = params.urgencia === "URGENTE"
      ? "🚨 URGENTE"
      : params.urgencia === "HOY"
      ? "⚠️ Hoy"
      : "";

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0c1222;padding:32px 0;">
  <div style="background:#111827;border-radius:12px;max-width:560px;margin:0 auto;border:1px solid #1e293b;overflow:hidden;">
    <div style="background:#0f172a;padding:20px 28px;">
      <div style="color:#f59e0b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
        ${urgenciaLabel ? `${urgenciaLabel} · ` : ""}Nueva Alerta de Cobertura
      </div>
      <h1 style="color:#f1f5f9;font-size:20px;font-weight:600;margin:8px 0 0;">
        ${params.instalacionNombre}
      </h1>
    </div>
    <div style="padding:20px 28px;">
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 16px;">
        ${params.creadaPorNombre} creó una alerta de cobertura. Notificamos a
        ${params.totalGuardias} guardia(s) en ${params.oleadasGeneradas} oleada(s).
      </p>
      <div style="background:#0f172a;border-radius:8px;border:1px solid #1e293b;padding:16px 20px;margin-bottom:16px;">
        ${params.instalacionDireccion ? `<p style="color:#64748b;font-size:11px;text-transform:uppercase;margin:0 0 2px;">Dirección</p><p style="color:#cbd5e1;font-size:14px;margin:0 0 12px;">${params.instalacionDireccion}</p>` : ""}
        <p style="color:#64748b;font-size:11px;text-transform:uppercase;margin:0 0 2px;">Horario</p>
        <p style="color:#f1f5f9;font-size:16px;font-weight:600;margin:0 0 12px;">${horario}</p>
        <p style="color:#64748b;font-size:11px;text-transform:uppercase;margin:0 0 2px;">Funciones</p>
        <p style="color:#cbd5e1;font-size:14px;margin:0 0 12px;">${params.funciones}</p>
        <p style="color:#64748b;font-size:11px;text-transform:uppercase;margin:0 0 2px;">Monto Ofrecido</p>
        <p style="color:#22c55e;font-size:22px;font-weight:700;margin:0;">${montoFmt}</p>
      </div>
      <div style="text-align:center;padding:8px 0 20px;">
        <a href="${linkDetalle}" style="background:#00d4aa;color:#0f172a;border-radius:8px;padding:14px 32px;text-decoration:none;font-size:14px;font-weight:700;display:inline-block;">
          VER DETALLE DE ALERTA
        </a>
      </div>
      <p style="color:#475569;font-size:11px;margin:16px 0 0;border-top:1px solid #1e293b;padding-top:16px;">
        Este email se envía automáticamente al grupo de operaciones del tenant.
        Para dejar de recibirlo, cambiar el email en Configuración → Empresa.
      </p>
    </div>
  </div>
</div>`;

    await resend.emails.send({
      from: emailConfig.from,
      replyTo: emailConfig.replyTo,
      to: emailOps,
      subject: `${urgenciaLabel ? urgenciaLabel + " " : ""}Nueva alerta de cobertura — ${params.instalacionNombre}`,
      html,
      headers: { "X-Entity-Ref-ID": params.alertaId },
      // @ts-ignore
      clickTracking: false,
      openTracking: false,
    });
    console.log(
      `[AlertaCobertura:Notif] Email alerta creada enviado a ops (${emailOps})`,
    );
  } catch (e) {
    console.error("[AlertaCobertura:Notif] Error notificando ops (alerta creada):", e);
  }
}

// ======================================
// HELPERS
// ======================================

function formatearRangoHorario(inicio: Date, fin: Date): string {
  const inicioZoned = toZonedTime(inicio, TZ);
  const finZoned = toZonedTime(fin, TZ);
  const dia = format(inicioZoned, "EEE d MMM", { locale: es });
  const horaInicio = format(inicioZoned, "HH:mm");
  const horaFin = format(finZoned, "HH:mm");
  return `${dia} | ${horaInicio} - ${horaFin}`;
}

function mapearModalidadLabel(modalidad: string): string {
  const map: Record<string, string> = {
    GGSS: "Guardia de Seguridad (GGSS)",
    CCTV: "Operador CCTV",
    TACTICO: "Táctico",
  };
  return map[modalidad] || modalidad;
}
