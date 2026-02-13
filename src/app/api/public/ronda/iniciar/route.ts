import { NextRequest, NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeRut, isValidChileanRut } from "@/lib/personas";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(1),
  rut: z.string().min(1),
  pin: z.string().min(4).max(6),
  ejecucionId: z.string().uuid(),
  deviceInfo: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });

    const { code, rut, pin, ejecucionId, deviceInfo } = parsed.data;
    const normalizedRut = normalizeRut(rut);
    if (!isValidChileanRut(normalizedRut)) {
      return NextResponse.json({ success: false, error: "RUT inválido" }, { status: 400 });
    }

    const installation = await prisma.crmInstallation.findFirst({
      where: { marcacionCode: code, isActive: true },
      select: { id: true, tenantId: true },
    });
    if (!installation) return NextResponse.json({ success: false, error: "Código inválido" }, { status: 404 });

    const persona = await prisma.opsPersona.findFirst({
      where: { tenantId: installation.tenantId, rut: normalizedRut },
      select: { guardia: { select: { id: true, marcacionPin: true } } },
    });
    if (!persona?.guardia?.marcacionPin) return NextResponse.json({ success: false, error: "Credenciales inválidas" }, { status: 401 });
    if (!await bcrypt.compare(pin, persona.guardia.marcacionPin)) {
      return NextResponse.json({ success: false, error: "Credenciales inválidas" }, { status: 401 });
    }

    const result = await prisma.opsRondaEjecucion.updateMany({
      where: {
        id: ejecucionId,
        tenantId: installation.tenantId,
        guardiaId: persona.guardia.id,
        status: { in: ["pendiente", "incompleta"] },
      },
      data: {
        status: "en_curso",
        startedAt: new Date(),
        deviceInfo: (deviceInfo ?? null) as never,
      },
    });
    if (result.count === 0) {
      return NextResponse.json({ success: false, error: "Ejecución no disponible" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] public iniciar", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
