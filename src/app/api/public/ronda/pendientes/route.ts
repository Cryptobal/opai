import { NextRequest, NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeRut, isValidChileanRut } from "@/lib/personas";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const rut = request.nextUrl.searchParams.get("rut");
    const pin = request.nextUrl.searchParams.get("pin");
    if (!code || !rut || !pin) {
      return NextResponse.json({ success: false, error: "Parámetros incompletos" }, { status: 400 });
    }

    const normalizedRut = normalizeRut(rut);
    if (!isValidChileanRut(normalizedRut)) {
      return NextResponse.json({ success: false, error: "RUT inválido" }, { status: 400 });
    }

    const installation = await prisma.crmInstallation.findFirst({
      where: { marcacionCode: code, isActive: true },
      select: { id: true, tenantId: true },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Código inválido" }, { status: 404 });
    }

    const persona = await prisma.opsPersona.findFirst({
      where: { tenantId: installation.tenantId, rut: normalizedRut },
      select: {
        firstName: true,
        lastName: true,
        guardia: { select: { id: true, marcacionPin: true, isBlacklisted: true } },
      },
    });
    if (!persona?.guardia?.marcacionPin) {
      return NextResponse.json({ success: false, error: "Credenciales inválidas" }, { status: 401 });
    }
    if (!await bcrypt.compare(pin, persona.guardia.marcacionPin)) {
      return NextResponse.json({ success: false, error: "Credenciales inválidas" }, { status: 401 });
    }
    if (persona.guardia.isBlacklisted) {
      return NextResponse.json({ success: false, error: "Guardia no habilitado" }, { status: 403 });
    }

    const now = new Date();
    const rows = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: installation.tenantId,
        guardiaId: persona.guardia.id,
        rondaTemplate: { installationId: installation.id },
        status: { in: ["pendiente", "en_curso", "incompleta"] },
        scheduledAt: { lte: new Date(now.getTime() + 12 * 60 * 60 * 1000) },
      },
      include: {
        rondaTemplate: {
          include: {
            checkpoints: {
              include: { checkpoint: true },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: 30,
    });

    return NextResponse.json({
      success: true,
      data: {
        guardiaNombre: `${persona.firstName} ${persona.lastName}`,
        guardiaId: persona.guardia.id,
        rondas: rows,
      },
    });
  } catch (error) {
    console.error("[RONDAS] public pendientes", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
