import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";

const schema = z.object({
  guardiaId: z.string().uuid(),
  installationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  ejecucionId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos" },
        { status: 400 }
      );
    }

    const { guardiaId, installationId, tenantId, lat, lng, ejecucionId, note } =
      parsed.data;

    // Validate guard exists and belongs to tenant
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId, tenantId },
      include: {
        persona: { select: { firstName: true, lastName: true } },
      },
    });
    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 }
      );
    }

    // Get installation name for the alert payload
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId },
      select: { id: true, name: true },
    });

    const guardiaNombre =
      `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim();

    // Create incident + alert in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const incidente = await tx.opsRondaIncidente.create({
        data: {
          tenantId,
          guardiaId,
          installationId,
          ejecucionId: ejecucionId || undefined,
          tipo: "panico",
          descripcion: note || "Boton de panico activado",
          lat: lat ?? undefined,
          lng: lng ?? undefined,
          status: "abierto",
        },
      });

      // Always create alert — ejecucionId is now nullable
      const alerta = await tx.opsAlertaRonda.create({
        data: {
          tenantId,
          ejecucionId: ejecucionId || null,
          installationId,
          guardiaId,
          tipo: "panico",
          severidad: "critical",
          mensaje: `Boton de panico activado por ${guardiaNombre}`,
          data: {
            lat: lat ?? null,
            lng: lng ?? null,
            note: note ?? null,
            guardiaId,
          } as never,
        },
      });

      return { incidente, alerta };
    });

    // Trigger Pusher event for real-time dashboard alert
    try {
      const pusher = getPusherServer();
      await pusher.trigger(`monitoreo-${tenantId}`, "alerta-panico", {
        alertaId: result.alerta?.id ?? null,
        incidenteId: result.incidente.id,
        guardiaId,
        guardiaNombre,
        installationId,
        installationNombre: installation?.name ?? "Instalacion",
        lat: lat ?? null,
        lng: lng ?? null,
        timestamp: new Date().toISOString(),
      });
    } catch (pusherErr) {
      // Non-blocking: alert is already saved in DB
      console.error("[PANICO] Pusher trigger failed:", pusherErr);
    }

    return NextResponse.json({
      success: true,
      alertaId: result.alerta?.id ?? null,
      incidenteId: result.incidente.id,
    });
  } catch (error) {
    console.error("[PORTAL_RONDAS_PANICO]", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
