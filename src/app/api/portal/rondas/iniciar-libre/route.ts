import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  guardiaId: z.string().uuid(),
  installationId: z.string().uuid(),
  tenantId: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  deviceInfo: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos invalidos" }, { status: 400 });
    }

    const { guardiaId, installationId, tenantId, deviceInfo } = parsed.data;

    // Validate guard belongs to tenant
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId, tenantId },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    // Check no other ad-hoc ronda is already en_curso for this guard
    const existing = await prisma.opsRondaEjecucion.findFirst({
      where: {
        guardiaId,
        tenantId,
        isAdHoc: true,
        status: "en_curso",
      },
    });
    if (existing) {
      return NextResponse.json({
        success: false,
        error: "Ya tienes una ronda libre en curso",
      }, { status: 409 });
    }

    const now = new Date();

    const ejecucion = await prisma.opsRondaEjecucion.create({
      data: {
        tenantId,
        guardiaId,
        installationId,
        isAdHoc: true,
        rondaTemplateId: null,
        programacionId: null,
        status: "en_curso",
        scheduledAt: now,
        startedAt: now,
        checkpointsTotal: 0,
        checkpointsCompletados: 0,
        deviceInfo: deviceInfo as any,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ejecucionId: ejecucion.id,
        status: ejecucion.status,
        startedAt: ejecucion.startedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("[PORTAL_RONDAS_INICIAR_LIBRE]", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
