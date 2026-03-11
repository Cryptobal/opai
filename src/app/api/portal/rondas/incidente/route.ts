import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveTurnoId } from "@/lib/rondas/get-active-turno";
import { formatPersonName } from "@/lib/personas";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      tenantId,
      guardiaId,
      installationId,
      ejecucionId,
      checkpointId,
      tipo,
      descripcion,
      fotoUrl,
      lat,
      lng,
    } = body as {
      tenantId?: string;
      guardiaId?: string;
      installationId?: string;
      ejecucionId?: string;
      checkpointId?: string;
      tipo?: string;
      descripcion?: string;
      fotoUrl?: string;
      lat?: number;
      lng?: number;
    };

    if (!tenantId || !guardiaId || !tipo || !descripcion) {
      return NextResponse.json(
        { success: false, error: "Campos requeridos faltantes" },
        { status: 400 }
      );
    }

    const incidente = await prisma.opsRondaIncidente.create({
      data: {
        tenantId,
        guardiaId,
        installationId: installationId || undefined,
        ejecucionId: ejecucionId || undefined,
        checkpointId: checkpointId || undefined,
        tipo,
        descripcion,
        fotoUrl: fotoUrl || undefined,
        lat: lat ?? undefined,
        lng: lng ?? undefined,
        status: "abierto",
      },
    });

    // Crear también OpsAlertaRonda para que aparezca en Alertas y se pueda hacer seguimiento
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId, tenantId },
      select: { persona: { select: { firstName: true, lastName: true } } },
    });
    const installation = installationId
      ? await prisma.crmInstallation.findFirst({
          where: { id: installationId, tenantId },
          select: { name: true },
        })
      : null;
    const guardiaNombre = guardia?.persona
      ? formatPersonName(guardia.persona.firstName, guardia.persona.lastName)
      : "Guardia";
    const instNombre = installation?.name ?? "Sin instalación";
    const turnoId = await getActiveTurnoId(tenantId);

    await prisma.opsAlertaRonda.create({
      data: {
        tenantId,
        ejecucionId: ejecucionId || null,
        installationId: installationId || null,
        guardiaId,
        turnoId,
        tipo: "incidente_guardia",
        severidad: "warning",
        mensaje: `Incidente reportado por ${guardiaNombre} (${instNombre}): ${descripcion.slice(0, 200)}${descripcion.length > 200 ? "…" : ""}`,
        data: {
          incidenteId: incidente.id,
          tipoOriginal: tipo,
          descripcion,
          fotoUrl: fotoUrl ?? null,
          lat: lat ?? null,
          lng: lng ?? null,
        } as never,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id: incidente.id },
    });
  } catch (error) {
    console.error("[Portal Rondas] Incidente error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear incidente" },
      { status: 500 }
    );
  }
}
