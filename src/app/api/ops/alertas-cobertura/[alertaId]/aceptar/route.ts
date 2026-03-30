import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { notificarSupervisorAceptacion } from "@/lib/alertas-cobertura/notificacion.service";
import { verificarTokenExterno } from "@/lib/alertas-cobertura/token.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ alertaId: string }> },
) {
  try {
    const { alertaId } = await params;

    // Auth dual: session del portal guardia O token JWT externo
    let guardiaId: string;
    let esInterno: boolean;
    let guardiaLat: unknown = null;
    let guardiaLng: unknown = null;

    const ctx = await requireAuth().catch(() => null);

    if (ctx) {
      // Auth vía sesión (guardia interno con login)
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

      guardiaId = guardia.id;
      esInterno = true;
      guardiaLat = guardia.persona?.lat;
      guardiaLng = guardia.persona?.lng;
    } else {
      // Auth vía token JWT (guardia externo sin login)
      const tokenHeader = request.headers.get("X-Alerta-Token");
      const tokenParam = request.nextUrl.searchParams.get("token");
      const token = tokenHeader || tokenParam;

      if (!token) {
        return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
      }

      const decoded = await verificarTokenExterno(token);
      if (!decoded || decoded.alertaId !== alertaId) {
        return NextResponse.json({ success: false, error: "Token inválido o expirado" }, { status: 401 });
      }

      guardiaId = decoded.guardiaId;
      esInterno = false;

      // Obtener coordenadas del guardia externo
      const guardia = await prisma.opsGuardia.findUnique({
        where: { id: guardiaId },
        select: { persona: { select: { lat: true, lng: true } } },
      });
      guardiaLat = guardia?.persona?.lat;
      guardiaLng = guardia?.persona?.lng;
    }

    // Calcular distancia si hay coordenadas
    let distanciaKm: number | null = null;
    if (guardiaLat && guardiaLng) {
      const alertaGeo = await prisma.opsAlertaCobertura.findUnique({
        where: { id: alertaId },
        select: {
          installation: { select: { lat: true, lng: true } },
        },
      });
      if (alertaGeo?.installation?.lat && alertaGeo?.installation?.lng) {
        const { haversineDistance } = await import("@/lib/marcacion");
        const distM = haversineDistance(
          Number(guardiaLat),
          Number(guardiaLng),
          Number(alertaGeo.installation.lat),
          Number(alertaGeo.installation.lng),
        );
        distanciaKm = Math.round((distM / 1000) * 100) / 100;
      }
    }

    // Transacción atómica — race condition safe
    const resultado = await prisma.$transaction(async (tx: any) => {
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

      // For internal auth, verify tenant matches
      if (ctx && alerta.tenantId !== ctx.tenantId) {
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
      // Sprint 3: Notificar supervisor (fire-and-forget)
      const alertaCompleta = await prisma.opsAlertaCobertura.findUnique({
        where: { id: alertaId },
        select: {
          tenantId: true,
          installationId: true,
          creadaPorId: true,
          installation: { select: { name: true } },
        },
      });

      const guardiaData = await prisma.opsGuardia.findUnique({
        where: { id: guardiaId },
        include: {
          persona: { select: { firstName: true, lastName: true, phone: true, email: true } },
        },
      });

      if (alertaCompleta && guardiaData) {
        notificarSupervisorAceptacion({
          tenantId: alertaCompleta.tenantId,
          alertaId,
          instalacionId: alertaCompleta.installationId,
          instalacionNombre: alertaCompleta.installation.name,
          guardiaId,
          guardiaNombre: `${guardiaData.persona.firstName} ${guardiaData.persona.lastName}`,
          guardiaPhone: guardiaData.persona.phone,
          guardiaEmail: guardiaData.persona.email,
          distanciaKm: distanciaKm ?? null,
          esInterno,
          creadaPorId: alertaCompleta.creadaPorId,
        }).catch((err) => console.error("[AlertaCobertura] Error notificando aceptación:", err));
      }

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
