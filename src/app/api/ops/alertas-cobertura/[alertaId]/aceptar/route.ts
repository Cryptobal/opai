import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ alertaId: string }> },
) {
  try {
    // Auth dual: session del portal guardia O token en body
    const ctx = await requireAuth();
    // TODO Sprint 3: Soportar token externo para pool de dealers
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { alertaId } = await params;

    // Resolver guardiaId desde el usuario autenticado
    const guardia = await prisma.opsGuardia.findFirst({
      where: { tenantId: ctx.tenantId, persona: { email: ctx.userEmail } },
      select: {
        id: true,
        currentInstallationId: true,
        persona: { select: { lat: true, lng: true } },
      },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "No se encontró guardia asociado a este usuario" },
        { status: 404 },
      );
    }

    const guardiaId = guardia.id;
    const esInterno = true; // TODO Sprint 2: determinar por pool externo

    // Calcular distancia si hay coordenadas
    let distanciaKm: number | null = null;
    if (guardia.persona?.lat && guardia.persona?.lng) {
      const alerta = await prisma.opsAlertaCobertura.findUnique({
        where: { id: alertaId },
        select: {
          installation: { select: { lat: true, lng: true } },
        },
      });
      if (alerta?.installation?.lat && alerta?.installation?.lng) {
        const { haversineDistance } = await import("@/lib/marcacion");
        const distM = haversineDistance(
          guardia.persona.lat,
          guardia.persona.lng,
          alerta.installation.lat,
          alerta.installation.lng,
        );
        distanciaKm = Math.round((distM / 1000) * 100) / 100;
      }
    }

    // Transacción atómica — race condition safe
    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Leer estado actual de la alerta
      const alerta = await tx.opsAlertaCobertura.findUnique({
        where: { id: alertaId },
        select: {
          estado: true,
          aceptadaPorGuardiaId: true,
          oleadaActual: true,
          tenantId: true,
        },
      });

      if (!alerta) {
        return { exito: false, error: "Alerta no encontrada", status: 404 };
      }

      if (alerta.tenantId !== ctx.tenantId) {
        return { exito: false, error: "No autorizado", status: 403 };
      }

      // Ya fue tomada por otro guardia
      if (alerta.aceptadaPorGuardiaId) {
        await tx.opsAlertaAceptacion.create({
          data: {
            alertaId,
            guardiaId,
            oleadaNumero: alerta.oleadaActual,
            esInterno,
            exito: false,
            distanciaKm,
          },
        });
        return { exito: false, error: "tarde", status: 409 };
      }

      // No está en estado aceptable
      if (alerta.estado !== "ACTIVA") {
        return { exito: false, error: "La alerta ya no está activa", status: 400 };
      }

      // Claim atómico con optimistic locking
      const updated = await tx.opsAlertaCobertura.updateMany({
        where: {
          id: alertaId,
          aceptadaPorGuardiaId: null,
          estado: "ACTIVA",
        },
        data: {
          aceptadaPorGuardiaId: guardiaId,
          aceptadaAt: new Date(),
          esInternoAceptacion: esInterno,
          estado: "ACEPTADA",
        },
      });

      if (updated.count === 0) {
        // Otro guardia ganó la race condition
        await tx.opsAlertaAceptacion.create({
          data: {
            alertaId,
            guardiaId,
            oleadaNumero: alerta.oleadaActual,
            esInterno,
            exito: false,
            distanciaKm,
          },
        });
        return { exito: false, error: "tarde", status: 409 };
      }

      // Registrar aceptación exitosa
      await tx.opsAlertaAceptacion.create({
        data: {
          alertaId,
          guardiaId,
          oleadaNumero: alerta.oleadaActual,
          esInterno,
          exito: true,
          distanciaKm,
        },
      });

      return { exito: true, status: 200 };
    });

    if (resultado.exito) {
      // TODO Sprint 3: Notificar supervisor (push + email + chat)
      return NextResponse.json({
        success: true,
        message: "¡Turno extra confirmado! El supervisor ha sido notificado.",
      });
    }

    if (resultado.error === "tarde") {
      return NextResponse.json(
        {
          success: false,
          message: "Este puesto ya fue aceptado. ¡Gracias por su amable disposición!",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { success: false, error: resultado.error },
      { status: resultado.status },
    );
  } catch (error) {
    console.error("[AlertasCobertura] Error al aceptar alerta:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar aceptación" },
      { status: 500 },
    );
  }
}
