import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/personas";
import { getActiveTurnoId } from "@/lib/rondas/get-active-turno";

const schema = z.object({
  executionId: z.string().uuid(),
  checkpointId: z.string().uuid().optional().nullable(),
  tipo: z.string().min(1).max(50),
  descripcion: z.string().min(3).max(2000),
  fotoUrl: z.string().optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    console.log(`[public/ronda] POST /api/public/ronda/incidente — ${new Date().toISOString()}`);
    const payload = await request.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
    }

    const execution = await prisma.opsRondaEjecucion.findUnique({
      where: { id: parsed.data.executionId },
      include: {
        rondaTemplate: { select: { id: true, name: true, installationId: true } },
        guardia: {
          select: { persona: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!execution || !execution.guardiaId) {
      return NextResponse.json({ success: false, error: "Ejecución inválida" }, { status: 404 });
    }

    // Resolve installationId from the execution or its template
    const resolvedInstallationId =
      execution.installationId ?? execution.rondaTemplate?.installationId ?? null;

    const incident = await prisma.opsRondaIncidente.create({
      data: {
        tenantId: execution.tenantId,
        ejecucionId: execution.id,
        rondaTemplateId: execution.rondaTemplateId,
        checkpointId: parsed.data.checkpointId ?? null,
        guardiaId: execution.guardiaId,
        installationId: resolvedInstallationId,
        tipo: parsed.data.tipo,
        descripcion: parsed.data.descripcion,
        fotoUrl: parsed.data.fotoUrl ?? null,
        lat: parsed.data.lat ?? null,
        lng: parsed.data.lng ?? null,
      },
    });

    // Create OpsAlertaRonda so the incident appears in Alertas dashboard
    if (resolvedInstallationId) {
      const guardiaNombre = execution.guardia?.persona
        ? formatPersonName(execution.guardia.persona.firstName, execution.guardia.persona.lastName)
        : "Guardia";

      const installation = await prisma.crmInstallation.findFirst({
        where: { id: resolvedInstallationId, tenantId: execution.tenantId },
        select: { name: true },
      });
      const instNombre = installation?.name ?? "Sin instalación";
      const turnoId = await getActiveTurnoId(execution.tenantId);
      const desc = parsed.data.descripcion;

      await prisma.opsAlertaRonda.create({
        data: {
          tenantId: execution.tenantId,
          ejecucionId: execution.id,
          installationId: resolvedInstallationId,
          guardiaId: execution.guardiaId,
          turnoId: turnoId ?? undefined,
          tipo: "incidente_guardia",
          severidad: "warning",
          mensaje: `Incidente reportado por ${guardiaNombre} (${instNombre}): ${desc.slice(0, 200)}${desc.length > 200 ? "…" : ""}`,
          data: {
            incidenteId: incident.id,
            tipoOriginal: parsed.data.tipo,
            descripcion: desc,
            fotoUrl: parsed.data.fotoUrl ?? null,
            lat: parsed.data.lat ?? null,
            lng: parsed.data.lng ?? null,
          } as never,
        },
      });
    }

    return NextResponse.json({ success: true, data: incident }, { status: 201 });
  } catch (error) {
    console.error("[RONDAS] public incidente", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
