import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  executionId: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
  note: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
    }

    const execution = await prisma.opsRondaEjecucion.findUnique({
      where: { id: parsed.data.executionId },
      include: { rondaTemplate: true },
    });
    if (!execution || !execution.guardiaId) {
      return NextResponse.json({ success: false, error: "Ejecución inválida" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.opsRondaIncidente.create({
        data: {
          tenantId: execution.tenantId,
          ejecucionId: execution.id,
          rondaTemplateId: execution.rondaTemplateId,
          guardiaId: execution.guardiaId!,
          tipo: "panico",
          descripcion: parsed.data.note ?? "Botón de pánico activado",
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          status: "abierto",
        },
      });

      await tx.opsAlertaRonda.create({
        data: {
          tenantId: execution.tenantId,
          ejecucionId: execution.id,
          installationId: execution.rondaTemplate.installationId,
          tipo: "panico",
          severidad: "critical",
          mensaje: "Botón de pánico activado por guardia en ronda",
          data: {
            lat: parsed.data.lat,
            lng: parsed.data.lng,
            note: parsed.data.note ?? null,
          } as never,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] public panico", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
