import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const guardiaId = request.nextUrl.searchParams.get("guardiaId");
    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId requerido" },
        { status: 400 }
      );
    }

    const [status, logs] = await Promise.all([
      prisma.opsOnboardingStatus.findUnique({
        where: { guardiaId },
      }),
      prisma.opsEmailLog.findMany({
        where: { guardiaId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          tipo: true,
          trigger: true,
          asunto: true,
          estado: true,
          abierto: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        status: status
          ? {
              estado: status.estado,
              emailEnviado: status.emailEnviado,
              fechaEnvio: status.fechaEnvio?.toISOString() ?? null,
              emailAbierto: status.emailAbierto,
              fechaAbierto: status.fechaAbierto?.toISOString() ?? null,
              accesoPortalGuardia: status.accesoPortalGuardia,
              fechaAccesoGuardia:
                status.fechaAccesoGuardia?.toISOString() ?? null,
              accesoPortalRondas: status.accesoPortalRondas,
              fechaAccesoRondas:
                status.fechaAccesoRondas?.toISOString() ?? null,
              accesoPortalAcceso: status.accesoPortalAcceso,
              fechaAccesoAcceso:
                status.fechaAccesoAcceso?.toISOString() ?? null,
              recordatorioEnviado: status.recordatorioEnviado,
              fechaRecordatorio:
                status.fechaRecordatorio?.toISOString() ?? null,
              completadoAt: status.completadoAt?.toISOString() ?? null,
            }
          : null,
        logs: logs.map((l) => ({
          id: l.id,
          tipo: l.tipo,
          trigger: l.trigger,
          asunto: l.asunto,
          estado: l.estado,
          abierto: l.abierto,
          createdAt: l.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("[ONBOARDING] Error fetching guardia data:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener datos" },
      { status: 500 }
    );
  }
}
