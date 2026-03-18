import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeGuardName, requirePortalClienteAuth } from "@/lib/portal-cliente";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth();
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const { tenantId } = session;

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId || !session.installationIds.includes(installationId)) {
      return NextResponse.json({ success: false, error: "Sin acceso a esta instalación" }, { status: 403 });
    }

    const [rondas, alertas] = await Promise.all([
      prisma.opsRondaEjecucion.findMany({
        where: { tenantId, installationId, status: { in: ["completada", "incompleta"] } },
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
      prisma.opsAlertaRonda.findMany({
        where: { tenantId, installationId },
        select: {
          id: true,
          tipo: true,
          severidad: true,
          mensaje: true,
          // isResolved: true, // TODO: add field to schema
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
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
      const label = (a as Record<string, unknown>).isResolved ? "Resuelta" : "Pendiente";
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
