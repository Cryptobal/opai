import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";

const schema = z.object({
  executionId: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
  note: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    console.log(`[public/ronda] POST /api/public/ronda/panico — ${new Date().toISOString()}`);
    const payload = await request.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
    }

    const execution = await prisma.opsRondaEjecucion.findUnique({
      where: { id: parsed.data.executionId },
      include: {
        rondaTemplate: { select: { installationId: true } },
        guardia: { include: { persona: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!execution || !execution.guardiaId) {
      return NextResponse.json({ success: false, error: "Ejecución inválida" }, { status: 404 });
    }

    const alertInstallationId =
      execution.rondaTemplate?.installationId ?? execution.installationId;
    const guardiaNombre = execution.guardia
      ? `${execution.guardia.persona.firstName} ${execution.guardia.persona.lastName}`.trim()
      : "Guardia";

    // Get installation name for Pusher payload
    const installation = alertInstallationId
      ? await prisma.crmInstallation.findFirst({
          where: { id: alertInstallationId },
          select: { name: true },
        })
      : null;

    const result = await prisma.$transaction(async (tx) => {
      const incidente = await tx.opsRondaIncidente.create({
        data: {
          tenantId: execution.tenantId,
          ejecucionId: execution.id,
          rondaTemplateId: execution.rondaTemplateId,
          guardiaId: execution.guardiaId!,
          tipo: "panico",
          descripcion: parsed.data.note ?? "Boton de panico activado",
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          status: "abierto",
        },
      });

      let alerta = null;
      if (alertInstallationId) {
        alerta = await tx.opsAlertaRonda.create({
          data: {
            tenantId: execution.tenantId,
            ejecucionId: execution.id,
            installationId: alertInstallationId,
            guardiaId: execution.guardiaId!,
            tipo: "panico",
            severidad: "critical",
            mensaje: `Boton de panico activado por ${guardiaNombre}`,
            data: {
              lat: parsed.data.lat,
              lng: parsed.data.lng,
              note: parsed.data.note ?? null,
              guardiaId: execution.guardiaId,
            } as never,
          },
        });
      }

      return { incidente, alerta };
    });

    // Trigger Pusher event for real-time dashboard alert
    try {
      const pusher = getPusherServer();
      await pusher.trigger(`monitoreo-${execution.tenantId}`, "alerta-panico", {
        alertaId: result.alerta?.id ?? null,
        incidenteId: result.incidente.id,
        guardiaId: execution.guardiaId,
        guardiaNombre,
        installationId: alertInstallationId,
        installationNombre: installation?.name ?? "Instalacion",
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        timestamp: new Date().toISOString(),
      });
    } catch (pusherErr) {
      console.error("[public/panico] Pusher trigger failed:", pusherErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] public panico", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
