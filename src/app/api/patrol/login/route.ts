import { NextRequest, NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { formatPersonName, normalizeRut, isValidChileanRut } from "@/lib/personas";
import { patrolLoginSchema } from "@/lib/validations/rondas";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = patrolLoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
    }

    const { rut, pin, installationId, deviceId } = parsed.data;
    const normalizedRut = normalizeRut(rut);
    if (!isValidChileanRut(normalizedRut)) {
      return NextResponse.json({ success: false, error: "RUT inválido" }, { status: 400 });
    }

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, isActive: true },
      select: { id: true, tenantId: true, name: true },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
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
            isBlacklisted: true,
            marcacionPin: true,
            currentInstallationId: true,
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

    if (deviceId) {
      const device = await prisma.opsDispositivoInstalacion.findFirst({
        where: { installationId, deviceId },
      });
      if (device && !device.isAuthorized) {
        return NextResponse.json({ success: false, error: "Dispositivo no autorizado" }, { status: 403 });
      }
      if (device) {
        await prisma.opsDispositivoInstalacion.update({
          where: { id: device.id },
          data: { lastAccessAt: new Date() },
        });
      }
    }

    await prisma.opsPatrullajeSesion.updateMany({
      where: { guardiaId: persona.guardia.id, isActive: true },
      data: { isActive: false, logoutAt: new Date() },
    });

    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;

    const session = await prisma.opsPatrullajeSesion.create({
      data: {
        tenantId: installation.tenantId,
        guardiaId: persona.guardia.id,
        installationId,
        deviceId: deviceId ?? null,
        loginMethod: "RUT_PIN",
        isActive: true,
        ipAddress,
      },
    });

    const now = new Date();
    const pendingRondas = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: installation.tenantId,
        rondaTemplate: { installationId },
        status: { in: ["pendiente", "en_curso", "incompleta"] },
        scheduledAt: { lte: new Date(now.getTime() + 12 * 60 * 60 * 1000) },
      },
      include: {
        rondaTemplate: {
          include: {
            checkpoints: {
              include: {
                checkpoint: {
                  select: { id: true, name: true, lat: true, lng: true, geoRadiusM: true, qrCode: true },
                },
              },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      data: {
        session: { id: session.id, loginAt: session.loginAt },
        guardia: {
          id: persona.guardia.id,
          nombre: formatPersonName(persona.firstName, persona.lastName),
        },
        installation: {
          id: installation.id,
          name: installation.name,
        },
        rondas: pendingRondas,
      },
    });
  } catch (error) {
    console.error("[PATROL] login", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
