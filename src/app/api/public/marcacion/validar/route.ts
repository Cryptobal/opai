/**
 * POST /api/public/marcacion/validar
 * Valida RUT + PIN de un guardia en una instalación.
 * Ruta pública (sin auth de sesión).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeRut, isValidChileanRut } from "@/lib/personas";
import * as bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(1, "Código de instalación requerido"),
  rut: z.string().min(1, "RUT requerido"),
  pin: z.string().min(4).max(6),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { code, rut, pin } = parsed.data;

    // Validar formato RUT
    const normalizedRut = normalizeRut(rut);
    if (!isValidChileanRut(normalizedRut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

    // Buscar instalación por código de marcación
    const installation = await prisma.crmInstallation.findFirst({
      where: { marcacionCode: code, isActive: true },
      select: {
        id: true,
        tenantId: true,
        name: true,
        lat: true,
        lng: true,
        geoRadiusM: true,
      },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Código de instalación no válido" },
        { status: 404 }
      );
    }

    // Buscar guardia por RUT en el mismo tenant
    const persona = await prisma.opsPersona.findFirst({
      where: {
        rut: normalizedRut,
        tenantId: installation.tenantId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardia: {
          select: {
            id: true,
            lifecycleStatus: true,
            isBlacklisted: true,
            marcacionPin: true,
          },
        },
      },
    });

    if (!persona || !persona.guardia) {
      return NextResponse.json(
        { success: false, error: "RUT o PIN incorrecto" },
        { status: 401 }
      );
    }

    const guardia = persona.guardia;

    // Verificar que el guardia esté activo y no en lista negra
    if (!["seleccionado", "contratado"].includes(guardia.lifecycleStatus)) {
      return NextResponse.json(
        { success: false, error: "Guardia no activo" },
        { status: 403 }
      );
    }

    if (guardia.isBlacklisted) {
      return NextResponse.json(
        { success: false, error: "Guardia no habilitado" },
        { status: 403 }
      );
    }

    // Verificar PIN
    if (!guardia.marcacionPin) {
      return NextResponse.json(
        { success: false, error: "PIN no configurado. Contacte a su supervisor." },
        { status: 403 }
      );
    }

    const pinValid = await bcrypt.compare(pin, guardia.marcacionPin);
    if (!pinValid) {
      return NextResponse.json(
        { success: false, error: "RUT o PIN incorrecto" },
        { status: 401 }
      );
    }

    // Buscar la última marcación del guardia en esta instalación hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const ultimaMarcacion = await prisma.opsMarcacion.findFirst({
      where: {
        guardiaId: guardia.id,
        installationId: installation.id,
        timestamp: { gte: today, lt: tomorrow },
      },
      orderBy: { timestamp: "desc" },
      select: { tipo: true, timestamp: true },
    });

    // Determinar qué acción puede hacer: si la última fue "entrada", puede hacer "salida" y viceversa
    const siguienteAccion = !ultimaMarcacion || ultimaMarcacion.tipo === "salida"
      ? "entrada"
      : "salida";

    return NextResponse.json({
      success: true,
      data: {
        guardiaId: guardia.id,
        guardiaName: `${persona.firstName} ${persona.lastName}`,
        installationId: installation.id,
        installationName: installation.name,
        lat: installation.lat,
        lng: installation.lng,
        geoRadiusM: installation.geoRadiusM,
        siguienteAccion,
        ultimaMarcacion: ultimaMarcacion
          ? {
              tipo: ultimaMarcacion.tipo,
              timestamp: ultimaMarcacion.timestamp.toISOString(),
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[marcacion/validar] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
