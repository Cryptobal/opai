/**
 * API Route: /api/personas/onboarding/dashboard
 * POST - Devuelve métricas y lista de onboarding para el tenant del usuario.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { formatPersonName } from "@/lib/personas";

export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const tenantId = ctx.tenantId;

    // Métricas en paralelo
    const [totalActivos, onboardingRows, pendientesAcceso, emailsRebotados] = await Promise.all([
      prisma.opsGuardia.count({
        where: { tenantId, status: "active", isBlacklisted: false },
      }),
      prisma.opsOnboardingStatus.findMany({
        where: { tenantId },
        include: {
          guardia: {
            select: {
              id: true,
              code: true,
              persona: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.opsOnboardingStatus.count({
        where: {
          tenantId,
          estado: { in: ["PENDIENTE", "ENVIADO", "EN_PROGRESO"] },
          accesoPortalGuardia: false,
          accesoPortalRondas: false,
          accesoPortalAcceso: false,
        },
      }),
      prisma.opsEmailLog.count({
        where: { tenantId, rebotado: true },
      }),
    ]);

    const completados = onboardingRows.filter((r) => r.estado === "COMPLETADO").length;
    const totalConOnboarding = onboardingRows.length;
    const pctCompletado =
      totalConOnboarding > 0 ? Math.round((completados / totalConOnboarding) * 100) : 0;

    const items = onboardingRows.map((r) => ({
      id: r.id,
      guardiaId: r.guardiaId,
      guardiaNombre: formatPersonName(r.guardia.persona.firstName, r.guardia.persona.lastName),
      guardiaCode: r.guardia.code,
      estado: r.estado,
      emailEnviado: r.emailEnviado,
      fechaEnvio: r.fechaEnvio?.toISOString() ?? null,
      emailAbierto: r.emailAbierto,
      accesoPortalGuardia: r.accesoPortalGuardia,
      fechaAccesoGuardia: r.fechaAccesoGuardia?.toISOString() ?? null,
      accesoPortalRondas: r.accesoPortalRondas,
      fechaAccesoRondas: r.fechaAccesoRondas?.toISOString() ?? null,
      accesoPortalAcceso: r.accesoPortalAcceso,
      fechaAccesoAcceso: r.fechaAccesoAcceso?.toISOString() ?? null,
      recordatorioEnviado: r.recordatorioEnviado,
      fechaRecordatorio: r.fechaRecordatorio?.toISOString() ?? null,
    }));

    return NextResponse.json({
      success: true,
      metrics: {
        totalActivos,
        onboardingCompletado: completados,
        onboardingCompletadoPct: pctCompletado,
        pendientesAcceso,
        emailsRebotados,
      },
      items,
    });
  } catch (error) {
    console.error("[PERSONAS] Error onboarding dashboard:", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar dashboard" },
      { status: 500 }
    );
  }
}
