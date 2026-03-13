/**
 * GET /api/fiscalizacion/marcaciones
 * Historial de marcaciones para fiscalización DT (read-only)
 * Acceso: inspector_dt, owner, admin
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const allowedRoles = ["owner", "admin", "inspector_dt"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rut = searchParams.get("rut");
  const nombre = searchParams.get("nombre");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const skip = (page - 1) * limit;

  const guardiaFilter: Record<string, unknown> = { tenantId: session.user.tenantId };
  if (rut) {
    guardiaFilter.persona = { rut: { contains: rut } };
  }
  if (nombre) {
    guardiaFilter.persona = {
      ...((guardiaFilter.persona as Record<string, unknown>) || {}),
      OR: [
        { firstName: { contains: nombre, mode: "insensitive" } },
        { lastName: { contains: nombre, mode: "insensitive" } },
      ],
    };
  }

  const dateFilter: Record<string, unknown> = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) dateFilter.lte = new Date(to);

  const where: Record<string, unknown> = {
    guardia: guardiaFilter,
  };
  if (Object.keys(dateFilter).length > 0) {
    where.timestamp = dateFilter;
  }

  const [marcaciones, total] = await Promise.all([
    prisma.opsMarcacion.findMany({
      where,
      include: {
        guardia: {
          include: {
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        installation: { select: { name: true } },
      },
      orderBy: { timestamp: "desc" },
      skip,
      take: limit,
    }),
    prisma.opsMarcacion.count({ where }),
  ]);

  return NextResponse.json({
    marcaciones: marcaciones.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      timestamp: m.timestamp,
      guardiaRut: m.guardia?.persona?.rut,
      guardiaName: m.guardia?.persona
        ? `${m.guardia.persona.firstName} ${m.guardia.persona.lastName}`
        : null,
      installationName: m.installation?.name,
      metodoId: m.metodoId,
      lat: m.lat,
      lng: m.lng,
      geoValidada: m.geoValidada,
      integrityHash: m.hashIntegridad,
      employerRut: m.employerRut,
      employerName: m.employerName,
      gpsStatus: m.gpsStatus,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
