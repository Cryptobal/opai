import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

/**
 * Feed de notificaciones del PORTAL CLIENTE.
 *
 * Decisión de producto (PR2): el cliente **NO** ve alertas operativas internas
 * (velocidad anómala, guardia estático, batería baja, botón de pánico, etc.).
 * En su lugar, el feed se construye a partir de eventos que le importan:
 *
 *   1. Rondas completadas      → ronda_completada     (info)
 *   2. Rondas incompletas       → ronda_incompleta     (warning suave)
 *   3. Rondas no realizadas     → ronda_no_realizada   (destacado)
 *   4. Tickets respondidos      → ticket_respondido
 *   5. (Futuro) Documentos/cotizaciones
 *
 * Solo se muestran eventos de los últimos 30 días.
 */

const LOOKBACK_DAYS = 30;

/**
 * Tipos cliente-friendly expuestos por este endpoint. Si en el futuro se
 * amplía el feed, agregá el nuevo discriminador aquí para mantener el
 * contrato con `PortalAlertas` / `PortalNotificacionesSheet`.
 */
export const CLIENT_NOTIFICATION_TYPES = [
  "ronda_completada",
  "ronda_incompleta",
  "ronda_no_realizada",
  "ticket_respondido",
  "cotizacion_nueva",
  "documento_nuevo",
] as const;

export type ClientNotificationType = (typeof CLIENT_NOTIFICATION_TYPES)[number];

/**
 * Lista negra de tipos operativos que pudieron existir en `OpsAlertaRonda` y
 * que por diseño NO deben llegar al cliente. Expuesto para que los tests
 * puedan verificar que ningún mapper los emite.
 */
export const CLIENT_BLOCKED_NOTIFICATION_TYPES = [
  "alerta_velocidad",
  "alerta_guardia_estatico",
  "alerta_panico",
  "alerta_bateria",
  "alerta_generica",
] as const;

function timeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Hace un momento";
  if (minutes < 60) return `Hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

interface ClientNotification {
  id: string;
  type: ClientNotificationType;
  title: string;
  description: string;
  time: string;
  timestamp: string;
  isRead: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const installationIds = session.installationIds;
    if (installationIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    const notifications: ClientNotification[] = [];

    // ── 1. Rondas (completada / incompleta / no_realizada) ──────────────
    try {
      const rondas = await prisma.opsRondaEjecucion.findMany({
        where: {
          tenantId: session.tenantId,
          installationId: { in: installationIds },
          status: { in: ["completada", "incompleta", "no_realizada"] },
          scheduledAt: { gte: cutoff },
        },
        orderBy: { scheduledAt: "desc" },
        take: 30,
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          completedAt: true,
          checkpointsTotal: true,
          checkpointsCompletados: true,
          porcentajeCompletado: true,
        },
      });

      for (const r of rondas) {
        const ts = (r.completedAt ?? r.scheduledAt).toISOString();
        const total = r.checkpointsTotal;
        const done = r.checkpointsCompletados;

        if (r.status === "completada") {
          notifications.push({
            id: r.id,
            type: "ronda_completada",
            title: "Ronda completada",
            description:
              total > 0
                ? `${done}/${total} checkpoints verificados`
                : "Ronda ejecutada correctamente",
            time: timeAgo(r.completedAt ?? r.scheduledAt),
            timestamp: ts,
            // Las rondas completadas no requieren acción → "leídas".
            isRead: true,
          });
        } else if (r.status === "incompleta") {
          notifications.push({
            id: r.id,
            type: "ronda_incompleta",
            title: "Ronda incompleta",
            description:
              total > 0
                ? `${done}/${total} checkpoints (${Math.round(r.porcentajeCompletado)}%)`
                : `Avance ${Math.round(r.porcentajeCompletado)}%`,
            time: timeAgo(r.completedAt ?? r.scheduledAt),
            timestamp: ts,
            isRead: false,
          });
        } else {
          notifications.push({
            id: r.id,
            type: "ronda_no_realizada",
            title: "Ronda no realizada",
            description: "La ronda programada no fue ejecutada",
            time: timeAgo(r.scheduledAt),
            timestamp: ts,
            isRead: false,
          });
        }
      }
    } catch (err) {
      console.warn("[Portal Cliente] notificaciones rondas error:", err);
    }

    // ── 2. Tickets respondidos ──────────────────────────────────────────
    try {
      const tickets = await prisma.opsTicket.findMany({
        where: {
          tenantId: session.tenantId,
          installationId: { in: installationIds },
          source: "portal_cliente",
          updatedAt: { gte: cutoff },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
        },
      });

      for (const t of tickets) {
        if (t.status === "resolved" || t.status === "closed") {
          notifications.push({
            id: t.id,
            type: "ticket_respondido",
            title: "Ticket respondido",
            description: t.title,
            time: timeAgo(t.updatedAt),
            timestamp: t.updatedAt.toISOString(),
            // Consideramos leídos los tickets cerrados hace > 24h.
            isRead: Date.now() - t.updatedAt.getTime() > 24 * 3600_000,
          });
        }
      }
    } catch (err) {
      console.warn("[Portal Cliente] notificaciones tickets error:", err);
    }

    // Orden: no leídas primero, luego por timestamp desc.
    notifications.sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      return b.timestamp.localeCompare(a.timestamp);
    });

    return NextResponse.json({ success: true, data: notifications.slice(0, 50) });
  } catch (error) {
    console.error("[Portal Cliente] notificaciones", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
