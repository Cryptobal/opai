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

    // Get earned badges with badge details
    const earnedBadges = await prisma.gamificacionGuardiaBadge.findMany({
      where: { guardiaId: guardAuth.guardiaId },
      include: {
        badge: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            descripcion: true,
            categoria: true,
            icono: true,
            color: true,
            puntosBonus: true,
            esSecreto: true,
            orden: true,
          },
        },
      },
      orderBy: { desbloqueadoAt: "desc" },
    });

    const earnedBadgeIds = earnedBadges.map((eb) => eb.badgeId);

    // Get visible unearned badges: active, not secret, not yet earned
    const unearnedBadges = await prisma.gamificacionBadge.findMany({
      where: {
        tenantId: guardAuth.tenantId,
        activo: true,
        esSecreto: false,
        id: { notIn: earnedBadgeIds.length > 0 ? earnedBadgeIds : ["__none__"] },
      },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        descripcion: true,
        categoria: true,
        icono: true,
        color: true,
        puntosBonus: true,
        orden: true,
        condicionTipo: true,
        condicionValor: true,
      },
      orderBy: { orden: "asc" },
    });

    const data = {
      earned: earnedBadges.map((eb) => ({
        ...eb.badge,
        desbloqueadoAt: eb.desbloqueadoAt,
        contexto: eb.contexto,
      })),
      unearned: unearnedBadges,
      totalEarned: earnedBadges.length,
      totalVisible: earnedBadges.length + unearnedBadges.length,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Gamification badges error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener badges" },
      { status: 500 },
    );
  }
}
