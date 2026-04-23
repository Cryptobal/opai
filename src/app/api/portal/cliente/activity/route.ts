import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeGuardName, requirePortalClienteAuth } from "@/lib/portal-cliente";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const { tenantId } = session;

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId || !session.installationIds.includes(installationId)) {
      return NextResponse.json({ success: false, error: "Sin acceso a esta instalación" }, { status: 403 });
    }

    // `includeAlerts` (default false) — por diseño, el cliente ve rondas
    // completadas/incompletas, NO alertas operativas internas (velocidad anómala, etc.).
    // Mantengo el flag para futuras vistas administrativas dentro del portal.
    const includeAlerts = request.nextUrl.searchParams.get("includeAlerts") === "true";

    // Incluir ejecuciones programadas cuyo installationId quedó en null
    // (se resuelven vía rondaTemplate).
    const installationScope = {
      OR: [
        { installationId },
        { rondaTemplate: { installationId } },
      ],
    };

    const [rondas, alertas] = await Promise.all([
      prisma.opsRondaEjecucion.findMany({
        where: { tenantId, ...installationScope, status: { in: ["completada", "incompleta"] } },
        select: {
          id: true,
          status: true,
          trustScore: true,
          completedAt: true,
          startedAt: true,
          checkpointsTotal: true,
          checkpointsCompletados: true,
          guardia: { select: { persona: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { completedAt: "desc" },
        take: 15,
      }),
      includeAlerts
        ? prisma.opsAlertaRonda.findMany({
            where: { tenantId, installationId },
            select: {
              id: true,
              tipo: true,
              severidad: true,
              mensaje: true,
              resuelta: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          })
        : Promise.resolve([] as Array<{
            id: string;
            tipo: string;
            severidad: string;
            mensaje: string | null;
            resuelta: boolean;
            createdAt: Date;
          }>),
    ]);

    type Activity = { id: string; type: string; timestamp: string; icon: string; text: string; detail?: string };
    const activities: Activity[] = [];

    for (const r of rondas) {
      const guardName = r.guardia
        ? sanitizeGuardName(r.guardia.persona.firstName, r.guardia.persona.lastName)
        : "Guardia";
      const ts = (r.completedAt ?? r.startedAt)?.toISOString() ?? "";
      if (r.status === "completada") {
        activities.push({
          id: r.id,
          type: "round_completed",
          timestamp: ts,
          icon: "green",
          text: `Ronda completada · ${guardName}`,
          detail: `${r.checkpointsCompletados}/${r.checkpointsTotal} checkpoints · Trust ${r.trustScore}`,
        });
      } else {
        activities.push({
          id: r.id,
          type: "round_incomplete",
          timestamp: ts,
          icon: "amber",
          text: `Ronda incompleta · ${guardName}`,
          detail: `${r.checkpointsCompletados}/${r.checkpointsTotal} checkpoints · Trust ${r.trustScore}`,
        });
      }
    }

    for (const a of alertas) {
      const label = a.resuelta ? "Resuelta" : "Pendiente";
      activities.push({
        id: a.id,
        type: "alert",
        timestamp: a.createdAt.toISOString(),
        icon: a.severidad === "critical" ? "red" : "amber",
        text: `Alerta: ${a.tipo.replace(/_/g, " ")}`,
        detail: `${a.mensaje?.slice(0, 80) ?? ""} · ${label}`,
      });
    }

    activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return NextResponse.json({ success: true, data: activities.slice(0, 20) });
  } catch (error) {
    console.error("[Portal Cliente] activity", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
