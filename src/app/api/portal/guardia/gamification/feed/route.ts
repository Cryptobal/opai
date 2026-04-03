import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    // Get the guard's current installation
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardAuth.guardiaId },
      select: { currentInstallationId: true },
    });

    if (!guardia?.currentInstallationId) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // Fetch recent recognitions in the same installation (last 20)
    const reconocimientos = await prisma.gamificacionReconocimiento.findMany({
      where: {
        tenantId: guardAuth.tenantId,
        installationId: guardia.currentInstallationId,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        categoria: true,
        mensaje: true,
        createdAt: true,
        dadorGuardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
        receptorGuardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    // Fetch recent badges earned by guards in the same installation (last 10)
    // We find guards currently in the same installation, then their recently earned badges
    const guardiasEnInstalacion = await prisma.opsGuardia.findMany({
      where: {
        tenantId: guardAuth.tenantId,
        currentInstallationId: guardia.currentInstallationId,
        status: "active",
      },
      select: { id: true },
    });

    const guardiaIds = guardiasEnInstalacion.map((g) => g.id);

    const badgesRecientes = guardiaIds.length > 0
      ? await prisma.gamificacionGuardiaBadge.findMany({
          where: {
            guardiaId: { in: guardiaIds },
            badge: { esSecreto: false },
          },
          orderBy: { desbloqueadoAt: "desc" },
          take: 10,
          select: {
            id: true,
            desbloqueadoAt: true,
            guardia: {
              select: {
                id: true,
                persona: { select: { firstName: true, lastName: true } },
              },
            },
            badge: {
              select: {
                nombre: true,
                icono: true,
                color: true,
                categoria: true,
              },
            },
          },
        })
      : [];

    // Combine into a unified feed
    type FeedItem = {
      id: string;
      tipo: "reconocimiento" | "badge";
      fecha: Date;
      data: Record<string, unknown>;
    };

    const feedItems: FeedItem[] = [];

    for (const r of reconocimientos) {
      feedItems.push({
        id: `rec-${r.id}`,
        tipo: "reconocimiento",
        fecha: r.createdAt,
        data: {
          categoria: r.categoria,
          mensaje: r.mensaje,
          dador: {
            id: r.dadorGuardia.id,
            nombre: `${r.dadorGuardia.persona.firstName} ${r.dadorGuardia.persona.lastName}`,
          },
          receptor: {
            id: r.receptorGuardia.id,
            nombre: `${r.receptorGuardia.persona.firstName} ${r.receptorGuardia.persona.lastName}`,
          },
        },
      });
    }

    for (const b of badgesRecientes) {
      feedItems.push({
        id: `badge-${b.id}`,
        tipo: "badge",
        fecha: b.desbloqueadoAt,
        data: {
          guardia: {
            id: b.guardia.id,
            nombre: `${b.guardia.persona.firstName} ${b.guardia.persona.lastName}`,
          },
          badge: {
            nombre: b.badge.nombre,
            icono: b.badge.icono,
            color: b.badge.color,
            categoria: b.badge.categoria,
          },
        },
      });
    }

    // Sort combined feed by date desc
    feedItems.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

    return NextResponse.json({ success: true, data: feedItems });
  } catch (error) {
    console.error("[Portal Guardia] Gamification feed error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener feed" },
      { status: 500 },
    );
  }
}
