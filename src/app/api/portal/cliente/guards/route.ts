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

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const rows = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId,
        installationId,
        scheduledAt: { gte: monthStart },
        guardiaId: { not: null },
        status: { in: ["completada", "incompleta"] },
      },
      select: {
        guardiaId: true,
        trustScore: true,
        status: true,
        guardia: {
          select: { persona: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    const guardMap = new Map<string, { name: string; rounds: number; trustSum: number; trustCount: number }>();
    for (const r of rows) {
      if (!r.guardiaId || !r.guardia) continue;
      const entry = guardMap.get(r.guardiaId) ?? {
        name: sanitizeGuardName(r.guardia.persona.firstName, r.guardia.persona.lastName),
        rounds: 0,
        trustSum: 0,
        trustCount: 0,
      };
      entry.rounds++;
      if (r.trustScore > 0) {
        entry.trustSum += r.trustScore;
        entry.trustCount++;
      }
      guardMap.set(r.guardiaId, entry);
    }

    const guards = Array.from(guardMap.values())
      .map((g) => ({
        name: g.name,
        rounds: g.rounds,
        trustAvg: g.trustCount > 0 ? Math.round(g.trustSum / g.trustCount) : 0,
      }))
      .sort((a, b) => b.trustAvg - a.trustAvg || b.rounds - a.rounds)
      .slice(0, 3);

    return NextResponse.json({ success: true, data: guards });
  } catch (error) {
    console.error("[Portal Cliente] guards", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
