/**
 * GET /api/ops/marcacion/reporte
 * Lista marcaciones con filtros para el panel admin de OPS.
 * Incluye toda la información requerida por la Resolución Exenta N°38:
 * - Identificación del trabajador
 * - Fecha y hora de entrada/salida
 * - Geolocalización y validación
 * - Hash de integridad
 * - Sello de tiempo
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(req.url);
    const installationId = searchParams.get("installationId");
    const guardiaId = searchParams.get("guardiaId");
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    // Construir filtro (solo marcaciones activas — soft delete)
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      deletedAt: null,
    };

    if (installationId) where.installationId = installationId;
    if (guardiaId) where.guardiaId = guardiaId;

    if (desde || hasta) {
      const tsFilter: Record<string, Date> = {};
      if (desde) tsFilter.gte = new Date(`${desde}T00:00:00.000Z`);
      if (hasta) {
        const hastaDate = new Date(`${hasta}T23:59:59.999Z`);
        tsFilter.lte = hastaDate;
      }
      where.timestamp = tsFilter;
    }

    const [marcaciones, total] = await Promise.all([
      prisma.opsMarcacion.findMany({
        where,
        include: {
          guardia: {
            select: {
              id: true,
              code: true,
              persona: {
                select: { firstName: true, lastName: true, rut: true, email: true },
              },
            },
          },
          installation: {
            select: { id: true, name: true, geoRadiusM: true },
          },
          puesto: {
            select: { id: true, name: true, shiftStart: true, shiftEnd: true },
          },
        },
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.opsMarcacion.count({ where }),
    ]);

    // Estadísticas resumen
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [totalHoy, entradasHoy, salidasHoy, fueraRadioHoy] = await Promise.all([
      prisma.opsMarcacion.count({
        where: { tenantId: ctx.tenantId, timestamp: { gte: today, lt: tomorrow }, deletedAt: null },
      }),
      prisma.opsMarcacion.count({
        where: { tenantId: ctx.tenantId, tipo: "entrada", timestamp: { gte: today, lt: tomorrow }, deletedAt: null },
      }),
      prisma.opsMarcacion.count({
        where: { tenantId: ctx.tenantId, tipo: "salida", timestamp: { gte: today, lt: tomorrow }, deletedAt: null },
      }),
      prisma.opsMarcacion.count({
        where: { tenantId: ctx.tenantId, gpsStatus: "fuera_rango", timestamp: { gte: today, lt: tomorrow }, deletedAt: null },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        marcaciones: marcaciones.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          timestamp: m.timestamp.toISOString(),
          guardia: {
            id: m.guardia.id,
            code: m.guardia.code,
            nombre: `${m.guardia.persona.firstName} ${m.guardia.persona.lastName}`,
            rut: m.guardia.persona.rut,
            email: m.guardia.persona.email,
          },
          installation: {
            id: m.installation.id,
            nombre: m.installation.name,
            geoRadiusM: m.installation.geoRadiusM,
          },
          puesto: m.puesto
            ? { id: m.puesto.id, nombre: m.puesto.name, horario: `${m.puesto.shiftStart}-${m.puesto.shiftEnd}` }
            : null,
          slotNumber: m.slotNumber,
          geo: {
            lat: m.lat,
            lng: m.lng,
            validada: m.geoValidada,
            distanciaM: m.geoDistanciaM,
          },
          metodoId: m.metodoId,
          fotoEvidencia: m.fotoEvidenciaUrl,
          ipAddress: m.ipAddress,
          userAgent: m.userAgent,
          hashIntegridad: m.hashIntegridad,
          createdAt: m.createdAt.toISOString(),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        stats: {
          totalHoy,
          entradasHoy,
          salidasHoy,
          fueraRadioHoy,
        },
      },
    });
  } catch (error) {
    console.error("[ops/marcacion/reporte] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
