/**
 * GET /api/public/marcacion/mis-marcaciones
 * Retorna las marcaciones del guardia en una instalación (últimos 30 días).
 * Ruta pública — requiere code + rut + pin como query params.
 *
 * Requisito Resolución Exenta N°38:
 * El trabajador debe poder acceder a sus propios registros.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeRut, isValidChileanRut } from "@/lib/personas";
import * as bcrypt from "bcryptjs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const rut = searchParams.get("rut");
    const pin = searchParams.get("pin");

    if (!code || !rut || !pin) {
      return NextResponse.json(
        { success: false, error: "Parámetros requeridos: code, rut, pin" },
        { status: 400 }
      );
    }

    const normalizedRut = normalizeRut(rut);
    if (!isValidChileanRut(normalizedRut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

    // Buscar instalación
    const installation = await prisma.crmInstallation.findFirst({
      where: { marcacionCode: code, isActive: true },
      select: { id: true, tenantId: true, name: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Código no válido" },
        { status: 404 }
      );
    }

    // Buscar guardia
    const persona = await prisma.opsPersona.findFirst({
      where: { rut: normalizedRut, tenantId: installation.tenantId },
      select: {
        firstName: true,
        lastName: true,
        guardia: {
          select: { id: true, marcacionPin: true },
        },
      },
    });

    if (!persona?.guardia?.marcacionPin) {
      return NextResponse.json(
        { success: false, error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const pinValid = await bcrypt.compare(pin, persona.guardia.marcacionPin);
    if (!pinValid) {
      return NextResponse.json(
        { success: false, error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    // Últimos 30 días
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    desde.setHours(0, 0, 0, 0);

    const marcaciones = await prisma.opsMarcacion.findMany({
      where: {
        guardiaId: persona.guardia.id,
        installationId: installation.id,
        timestamp: { gte: desde },
        deletedAt: null,
      },
      orderBy: { timestamp: "desc" },
      select: {
        id: true,
        tipo: true,
        timestamp: true,
        geoValidada: true,
        geoDistanciaM: true,
        hashIntegridad: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        guardiaName: `${persona.firstName} ${persona.lastName}`,
        installationName: installation.name,
        marcaciones: marcaciones.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          timestamp: m.timestamp.toISOString(),
          geoValidada: m.geoValidada,
          geoDistanciaM: m.geoDistanciaM,
          hash: m.hashIntegridad.slice(0, 12) + "...", // Solo primeros 12 chars para display
        })),
      },
    });
  } catch (error) {
    console.error("[marcacion/mis-marcaciones] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
