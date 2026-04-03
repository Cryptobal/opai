import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

/**
 * GET /api/portal/guardia/alertas?guardiaId=xxx
 *
 * Retorna alertas de cobertura activas donde este guardia fue notificado.
 */
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

    // Buscar notificaciones enviadas a este guardia con alertas activas
    const notificaciones = await prisma.opsAlertaNotificacion.findMany({
      where: { guardiaId: guardAuth.guardiaId },
      select: { alertaId: true, oleadaNumero: true },
      distinct: ["alertaId"],
    });

    if (notificaciones.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const alertaIds = notificaciones.map((n) => n.alertaId);

    const alertas = await prisma.opsAlertaCobertura.findMany({
      where: {
        tenantId: guardAuth.tenantId,
        OR: [
          { id: { in: alertaIds }, estado: "ACTIVA" },
          { aceptadaPorGuardiaId: guardAuth.guardiaId, estado: { in: ["ACEPTADA", "CONFIRMADA", "ASIGNADA_PAUTA"] } },
        ],
      },
      include: {
        installation: {
          select: { id: true, name: true, address: true, commune: true, city: true, lat: true, lng: true },
        },
      },
      orderBy: [
        { urgencia: "asc" }, // URGENTE first (alphabetically first)
        { createdAt: "desc" },
      ],
    });

    // Enriquecer con tiempo restante y estado de aceptación
    const ahora = new Date();

    const data = alertas.map((alerta) => {
      const tiempoRestanteMs = alerta.proximaOleadaAt
        ? alerta.proximaOleadaAt.getTime() - ahora.getTime()
        : 0;
      const tiempoRestanteSeg = Math.max(0, Math.floor(tiempoRestanteMs / 1000));

      return {
        id: alerta.id,
        instalacion: alerta.installation,
        fechaInicio: alerta.fechaInicio,
        fechaFin: alerta.fechaFin,
        montoOfrecido: alerta.montoOfrecido,
        funciones: alerta.funciones,
        urgencia: alerta.urgencia,
        estado: alerta.estado,
        tiempoRestanteSeg,
        aceptada: alerta.aceptadaPorGuardiaId != null,
        createdAt: alerta.createdAt,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal:Guardia:Alertas] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener alertas" },
      { status: 500 },
    );
  }
}
