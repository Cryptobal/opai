/**
 * Notification service for ronda alerts.
 *
 * Sends push notifications (to admins) and chat messages (to ops channel)
 * when CRITICAL alerts are created. Uses DB-based cooldown to avoid spam
 * in Vercel serverless environment.
 *
 * Panic alerts bypass cooldown and are sent immediately.
 */

import { prisma } from "@/lib/prisma";
import { sendPushToAdmins } from "@/lib/pwa/push-service";
import {
  getOpsChannelId,
  sendSystemChatMessage,
} from "@/lib/chat-system-message";

// ── Cooldown Config ──

const PUSH_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes between push notifications
const CHAT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between chat messages

function pushCooldownKey(tenantId: string) {
  return `ronda_alert_push_cooldown:${tenantId}`;
}

function chatCooldownKey(tenantId: string) {
  return `ronda_alert_chat_cooldown:${tenantId}`;
}

// ── Alert Type Labels ──

const ALERT_TYPE_LABELS: Record<string, string> = {
  geo_fuera_rango: "Fuera de rango",
  guardia_estatico: "Guardia estático",
  velocidad_anomala: "Velocidad anómala",
  checkpoint_saltado: "Checkpoint saltado",
  ronda_no_iniciada: "Ronda no iniciada",
  ronda_no_realizada: "Ronda no realizada",
  ronda_libre_timeout: "Ronda libre timeout",
  mismo_punto_repetido: "Punto repetido",
  sin_movimiento: "Sin movimiento",
  bateria_baja: "Batería baja",
  bateria_estatica: "Batería estática",
  panico: "PÁNICO",
};

function formatAlertType(tipo: string): string {
  return ALERT_TYPE_LABELS[tipo] || tipo;
}

// ── Main Entry Point ──

interface AlertNotificationParams {
  tenantId: string;
  tipo: string;
  severidad: string;
  mensaje: string;
}

// Alert types that should be sent to the ops chat channel.
// Other critical alerts (GPS out of range, static guard, etc.) only show in the monitoring panel.
const CHAT_ALLOWED_TYPES = ["panico", "ronda_no_iniciada", "ronda_no_realizada"];

/**
 * Send push + chat notifications for a critical alert.
 * Call fire-and-forget after creating an alert — does NOT throw.
 *
 * - Only sends for severidad === "critical"
 * - Panic alerts bypass cooldown
 * - Other critical alerts respect DB-based cooldown to avoid spam
 * - Only panic + coverage alerts are sent to chat (to reduce spam)
 */
export async function notifyCriticalAlert(
  params: AlertNotificationParams,
): Promise<void> {
  if (params.severidad !== "critical") return;

  const isPanic = params.tipo === "panico";
  const sendToChat = CHAT_ALLOWED_TYPES.includes(params.tipo);

  await Promise.allSettled([
    sendAlertPush(params, isPanic),
    ...(sendToChat ? [sendAlertToOpsChat(params, isPanic)] : []),
  ]);
}

/**
 * Batch variant: notify for multiple alerts created in a single operation.
 * Filters to critical only, sends one grouped notification.
 */
export async function notifyCriticalAlertsBatch(
  tenantId: string,
  alerts: Array<{ tipo: string; severidad: string; mensaje: string }>,
): Promise<void> {
  const critical = alerts.filter((a) => a.severidad === "critical");
  if (critical.length === 0) return;

  const hasPanic = critical.some((a) => a.tipo === "panico");

  if (critical.length === 1) {
    await notifyCriticalAlert({ tenantId, ...critical[0] });
    return;
  }

  // Multiple critical alerts — send grouped notification
  const chatAlerts = critical.filter((a) => CHAT_ALLOWED_TYPES.includes(a.tipo));

  await Promise.allSettled([
    sendGroupedAlertPush(tenantId, critical, hasPanic),
    ...(chatAlerts.length > 0
      ? [sendGroupedAlertToOpsChat(tenantId, chatAlerts, hasPanic)]
      : []),
  ]);
}

// ── Push Notifications ──

async function sendAlertPush(
  params: AlertNotificationParams,
  bypassCooldown: boolean,
): Promise<void> {
  try {
    if (!bypassCooldown) {
      const onCooldown = await isOnCooldown(
        params.tenantId,
        pushCooldownKey(params.tenantId),
        PUSH_COOLDOWN_MS,
      );
      if (onCooldown) return;
    }

    const emoji = params.tipo === "panico" ? "🆘" : "🚨";
    const typeLabel = formatAlertType(params.tipo);

    await sendPushToAdmins(
      params.tenantId,
      "ronda_alert_admin",
      `${emoji} Alerta: ${typeLabel}`,
      params.mensaje,
      "/ops/rondas/monitoreo",
    );

    if (!bypassCooldown) {
      await updateCooldown(params.tenantId, pushCooldownKey(params.tenantId));
    }
  } catch (error) {
    console.error("[alert-notifications] Push error:", error);
  }
}

async function sendGroupedAlertPush(
  tenantId: string,
  alerts: Array<{ tipo: string; severidad: string; mensaje: string }>,
  bypassCooldown: boolean,
): Promise<void> {
  try {
    if (!bypassCooldown) {
      const onCooldown = await isOnCooldown(
        tenantId,
        pushCooldownKey(tenantId),
        PUSH_COOLDOWN_MS,
      );
      if (onCooldown) return;
    }

    const types = [...new Set(alerts.map((a) => formatAlertType(a.tipo)))];

    await sendPushToAdmins(
      tenantId,
      "ronda_alert_admin",
      `🚨 ${alerts.length} alertas críticas de rondas`,
      `Tipos: ${types.join(", ")}`,
      "/ops/rondas/monitoreo",
    );

    if (!bypassCooldown) {
      await updateCooldown(tenantId, pushCooldownKey(tenantId));
    }
  } catch (error) {
    console.error("[alert-notifications] Grouped push error:", error);
  }
}

// ── Chat Notifications ──

async function sendAlertToOpsChat(
  params: AlertNotificationParams,
  bypassCooldown: boolean,
): Promise<void> {
  try {
    const channelId = await getOpsChannelId(params.tenantId);
    if (!channelId) return;

    if (!bypassCooldown) {
      const onCooldown = await isOnCooldown(
        params.tenantId,
        chatCooldownKey(params.tenantId),
        CHAT_COOLDOWN_MS,
      );
      if (onCooldown) return;
    }

    const typeLabel = formatAlertType(params.tipo);

    const content =
      params.tipo === "panico"
        ? [
            "🚨🚨🚨 **ALERTA DE PANICO** 🚨🚨🚨",
            "",
            params.mensaje,
            "",
            "⚠️ REQUIERE ATENCION INMEDIATA",
            "",
            "[Ver en Monitor](/ops/rondas/monitoreo)",
          ].join("\n")
        : [
            `🚨 **Alerta CRITICAL:** ${typeLabel}`,
            params.mensaje,
            "",
            "[Ver en Monitor](/ops/rondas/monitoreo)",
          ].join("\n");

    await sendSystemChatMessage({
      tenantId: params.tenantId,
      channelId,
      content,
      systemEventType: "ronda_alert",
      systemEventData: { tipo: params.tipo, severidad: params.severidad },
    });

    if (!bypassCooldown) {
      await updateCooldown(
        params.tenantId,
        chatCooldownKey(params.tenantId),
      );
    }
  } catch (error) {
    console.error("[alert-notifications] Chat error:", error);
  }
}

async function sendGroupedAlertToOpsChat(
  tenantId: string,
  alerts: Array<{ tipo: string; severidad: string; mensaje: string }>,
  bypassCooldown: boolean,
): Promise<void> {
  try {
    const channelId = await getOpsChannelId(tenantId);
    if (!channelId) return;

    if (!bypassCooldown) {
      const onCooldown = await isOnCooldown(
        tenantId,
        chatCooldownKey(tenantId),
        CHAT_COOLDOWN_MS,
      );
      if (onCooldown) return;
    }

    const types = [...new Set(alerts.map((a) => formatAlertType(a.tipo)))];
    const content = [
      `🚨 **${alerts.length} alertas críticas de rondas**`,
      `Tipos: ${types.join(", ")}`,
      "",
      alerts
        .slice(0, 5)
        .map((a) => `• ${formatAlertType(a.tipo)}: ${a.mensaje}`)
        .join("\n"),
      alerts.length > 5 ? `... y ${alerts.length - 5} más` : "",
      "",
      "[Ver en Monitor](/ops/rondas/monitoreo)",
    ]
      .filter(Boolean)
      .join("\n");

    await sendSystemChatMessage({
      tenantId,
      channelId,
      content,
      systemEventType: "ronda_alert_batch",
      systemEventData: { count: alerts.length, tipos: types },
    });

    if (!bypassCooldown) {
      await updateCooldown(tenantId, chatCooldownKey(tenantId));
    }
  } catch (error) {
    console.error("[alert-notifications] Grouped chat error:", error);
  }
}

// ── DB-based Cooldown ──

async function isOnCooldown(
  tenantId: string,
  key: string,
  cooldownMs: number,
): Promise<boolean> {
  try {
    const setting = await prisma.setting.findFirst({
      where: { key, tenantId },
      select: { value: true },
    });
    if (!setting?.value) return false;

    const lastSentAt = new Date(setting.value);
    return Date.now() - lastSentAt.getTime() < cooldownMs;
  } catch {
    return false; // fail open
  }
}

async function updateCooldown(
  tenantId: string,
  key: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await prisma.setting.upsert({
      where: { key },
      update: { value: now },
      create: {
        key,
        value: now,
        type: "string",
        category: "rondas",
        tenantId,
      },
    });
  } catch (error) {
    console.error("[alert-notifications] Cooldown update error:", error);
  }
}
