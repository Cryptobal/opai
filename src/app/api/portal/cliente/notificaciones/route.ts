import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

function timeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `Hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const installationIds = session.installations.map((i) => i.id);

    // Aggregate recent notifications from multiple sources
    const notifications: Array<{
      type: string;
      title: string;
      description: string;
      time: string;
      isRead: boolean;
    }> = [];

    // 1. Recent ronda alerts
    try {
      const alertas = await prisma.opsAlertaRonda.findMany({
        where: {
          tenantId: session.tenantId,
          installationId: { in: installationIds },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          tipo: true,
          mensaje: true,
          createdAt: true,
          resuelta: true,
        },
      });

      for (const a of alertas) {
        notifications.push({
          type: "ronda_completada",
          title: a.tipo === "ronda_incompleta" ? "Ronda incompleta" : "Alerta de ronda",
          description: a.mensaje ?? "",
          time: timeAgo(a.createdAt),
          isRead: a.resuelta,
        });
      }
    } catch {
      // Model may not exist
    }

    // 2. Recent ticket comments (responses)
    try {
      const tickets = await prisma.opsTicket.findMany({
        where: {
          tenantId: session.tenantId,
          installationId: { in: installationIds },
          source: "portal_cliente",
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
            type: "ticket_respondido",
            title: `Ticket respondido`,
            description: t.title,
            time: timeAgo(t.updatedAt),
            isRead: true,
          });
        }
      }
    } catch {
      // Model may not exist
    }

    // Sort by time (most recent first) and limit
    notifications.sort((a, b) => {
      // Simple sort: unread first, then by time string comparison
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      return 0;
    });

    return NextResponse.json({
      success: true,
      data: notifications.slice(0, 50),
    });
  } catch (error) {
    console.error("[Portal Cliente] notificaciones", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
