import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/portal/guardia/alertas/[alertaId]?guardiaId=xxx
 *
 * Retorna detalle completo de una alerta para que el guardia decida.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ alertaId: string }> },
) {
  try {
    const { alertaId } = await params;
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    // Verificar que el guardia fue notificado de esta alerta
    const notificacion = await prisma.opsAlertaNotificacion.findFirst({
      where: { alertaId, guardiaId },
    });

    if (!notificacion) {
      return NextResponse.json(
        { success: false, error: "No tienes acceso a esta alerta" },
        { status: 403 },
      );
    }

    const alerta = await prisma.opsAlertaCobertura.findUnique({
      where: { id: alertaId },
      include: {
        installation: {
          select: {
            id: true,
            name: true,
            address: true,
            commune: true,
            city: true,
            lat: true,
            lng: true,
          },
        },
      },
    });

    if (!alerta) {
      return NextResponse.json(
        { success: false, error: "Alerta no encontrada" },
        { status: 404 },
      );
    }

    // Calcular tiempo restante
    const ahora = new Date();
    const tiempoRestanteMs = alerta.proximaOleadaAt
      ? alerta.proximaOleadaAt.getTime() - ahora.getTime()
      : 0;
    const tiempoRestanteSeg = Math.max(0, Math.floor(tiempoRestanteMs / 1000));

    // Verificar si el guardia ya intentó aceptar
    const aceptacionPrevia = await prisma.opsAlertaAceptacion.findUnique({
      where: { alertaId_guardiaId: { alertaId, guardiaId } },
      select: { exito: true, intentoAt: true },
    });

    const data = {
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
      aceptadaPorMi: alerta.aceptadaPorGuardiaId === guardiaId,
      yaIntente: aceptacionPrevia != null,
      intentoExitoso: aceptacionPrevia?.exito ?? null,
      createdAt: alerta.createdAt,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal:Guardia:Alertas:Detalle] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener detalle de alerta" },
      { status: 500 },
    );
  }
}
