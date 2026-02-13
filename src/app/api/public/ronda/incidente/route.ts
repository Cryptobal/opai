import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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

    const incident = await prisma.opsRondaIncidente.create({
      data: {
        tenantId: execution.tenantId,
        ejecucionId: execution.id,
        rondaTemplateId: execution.rondaTemplateId,
        checkpointId: parsed.data.checkpointId ?? null,
        guardiaId: execution.guardiaId,
        tipo: parsed.data.tipo,
        descripcion: parsed.data.descripcion,
        fotoUrl: parsed.data.fotoUrl ?? null,
        lat: parsed.data.lat ?? null,
        lng: parsed.data.lng ?? null,
      },
    });

    return NextResponse.json({ success: true, data: incident }, { status: 201 });
  } catch (error) {
    console.error("[RONDAS] public incidente", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
