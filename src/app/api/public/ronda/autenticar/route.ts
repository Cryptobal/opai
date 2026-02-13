import { NextRequest, NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeRut, isValidChileanRut } from "@/lib/personas";
import { rondaAuthSchema } from "@/lib/validations/rondas";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const parsed = rondaAuthSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
    }
    const { code, rut, pin } = parsed.data;

    const normalizedRut = normalizeRut(rut);
    if (!isValidChileanRut(normalizedRut)) {
      return NextResponse.json({ success: false, error: "RUT inválido" }, { status: 400 });
    }

    const installation = await prisma.crmInstallation.findFirst({
      where: { marcacionCode: code, isActive: true },
      select: { id: true, tenantId: true, name: true },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Código inválido" }, { status: 404 });
    }

    const persona = await prisma.opsPersona.findFirst({
      where: { tenantId: installation.tenantId, rut: normalizedRut },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardia: {
          select: {
            id: true,
            status: true,
            lifecycleStatus: true,
            isBlacklisted: true,
            marcacionPin: true,
          },
        },
      },
    });

    if (!persona?.guardia?.marcacionPin) {
      return NextResponse.json({ success: false, error: "Credenciales inválidas" }, { status: 401 });
    }

    const pinOk = await bcrypt.compare(pin, persona.guardia.marcacionPin);
    if (!pinOk) {
      return NextResponse.json({ success: false, error: "Credenciales inválidas" }, { status: 401 });
    }
    if (persona.guardia.isBlacklisted) {
      return NextResponse.json({ success: false, error: "Guardia no habilitado" }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        installationId: installation.id,
        tenantId: installation.tenantId,
        installationName: installation.name,
        guardiaId: persona.guardia.id,
        guardiaNombre: `${persona.firstName} ${persona.lastName}`,
      },
    });
  } catch (error) {
    console.error("[RONDAS] public autenticar", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
