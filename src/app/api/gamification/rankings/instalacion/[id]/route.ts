import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { id } = await params;

    // Verify installation belongs to tenant
    const installation = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });

    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const periodoParam = searchParams.get("periodo");

    // Determine the period to use
    let periodo = periodoParam;
    if (!periodo) {
      const latest = await prisma.gamificacionScoreGuardia.findFirst({
        where: {
          installationId: id,
          tenantId: ctx.tenantId,
          periodoTipo: "diario",
        },
        orderBy: { periodo: "desc" },
        select: { periodo: true },
      });
      periodo = latest?.periodo ?? null;
    }

    if (!periodo) {
      return NextResponse.json({
        success: true,
        data: {
          instalacion: installation,
          periodo: null,
          page,
          limit,
          total: 0,
          totalPages: 0,
          ranking: [],
        },
      });
    }

    // Total count for pagination
    const total = await prisma.gamificacionScoreGuardia.count({
      where: {
        installationId: id,
        tenantId: ctx.tenantId,
        periodoTipo: "diario",
        periodo,
      },
    });

    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    // Get paginated scores sorted by trustScore desc
    const scores = await prisma.gamificacionScoreGuardia.findMany({
      where: {
        installationId: id,
        tenantId: ctx.tenantId,
        periodoTipo: "diario",
        periodo,
      },
      include: {
        guardia: {
          select: {
            id: true,
            code: true,
            persona: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { trustScore: "desc" },
      skip,
      take: limit,
    });

    const ranking = scores.map((s, index) => ({
      posicion: skip + index + 1,
      guardiaId: s.guardiaId,
      code: s.guardia.code,
      nombre: `${s.guardia.persona.firstName} ${s.guardia.persona.lastName}`,
      trustScore: s.trustScore,
      scoreRondas: s.scoreRondas,
      scoreAsistencia: s.scoreAsistencia,
      scoreSistemaDigital: s.scoreSistemaDigital,
      scoreSupervision: s.scoreSupervision,
      scoreCapacitacion: s.scoreCapacitacion,
      puntosNetos: s.puntosNetos,
      rachaActual: s.rachaActual,
      nivelActual: s.nivelActual,
      rankingInstalacion: s.rankingInstalacion,
    }));

    return NextResponse.json({
      success: true,
      data: {
        instalacion: installation,
        periodo,
        page,
        limit,
        total,
        totalPages,
        ranking,
      },
    });
  } catch (error) {
    console.error("[API gamification/rankings/instalacion] GET error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
