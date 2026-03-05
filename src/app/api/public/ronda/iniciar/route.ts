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

    const execution = await prisma.opsRondaEjecucion.findFirst({
      where: {
        id: ejecucionId,
        tenantId: installation.tenantId,
        rondaTemplate: { installationId: installation.id },
        status: { in: ["pendiente", "incompleta"] },
      },
      select: {
        id: true,
        guardiaId: true,
        alertas: true,
        rondaTemplate: {
          select: {
            checkpoints: {
              include: {
                checkpoint: {
                  select: { id: true, name: true, lat: true, lng: true, geoRadiusM: true, qrCode: true },
                },
              },
              orderBy: { orderIndex: "asc" as const },
            },
          },
        },
      },
    });
    if (!execution) {
      return NextResponse.json({ success: false, error: "Ejecución no disponible" }, { status: 404 });
    }

    const previousAlertData = (execution.alertas as Record<string, unknown> | null) ?? {};
    const assignedGuardiaId = execution.guardiaId;
    const isReplacement = Boolean(assignedGuardiaId && assignedGuardiaId !== persona.guardia.id);

    await prisma.opsRondaEjecucion.update({
      where: { id: execution.id },
      data: {
        status: "en_curso",
        startedAt: new Date(),
        guardiaId: persona.guardia.id,
        installationId: installation.id,
        deviceInfo: (deviceInfo ?? null) as never,
        alertas: {
          ...previousAlertData,
          assignment: {
            assignedGuardiaId: assignedGuardiaId ?? null,
            effectiveGuardiaId: persona.guardia.id,
            replacement: isReplacement,
            startedAt: new Date().toISOString(),
          },
        } as never,
      },
    });

    const checkpointData = execution.rondaTemplate?.checkpoints?.map((tc: any) => ({
      id: tc.checkpoint.id,
      name: tc.checkpoint.name,
      lat: tc.checkpoint.lat,
      lng: tc.checkpoint.lng,
      radius: tc.checkpoint.geoRadiusM,
      verificationType: (tc.checkpoint as any).verificationType,
      qrCode: tc.checkpoint.qrCode,
      order: tc.orderIndex,
      isRequired: tc.isRequired,
    })) ?? [];

    return NextResponse.json({
      success: true,
      data: { checkpoints: checkpointData },
    });
  } catch (error) {
    console.error("[RONDAS] public iniciar", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
