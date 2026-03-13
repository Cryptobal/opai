/**
 * GET /api/fiscalizacion/guardias
 * Búsqueda de guardias para fiscalización DT (read-only)
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
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  const where: Record<string, unknown> = { tenantId: session.user.tenantId };
  const personaWhere: Record<string, unknown> = {};

  if (rut) {
    personaWhere.rut = { contains: rut.replace(/[.\-]/g, "") };
  }
  if (nombre) {
    personaWhere.OR = [
      { firstName: { contains: nombre, mode: "insensitive" } },
      { lastName: { contains: nombre, mode: "insensitive" } },
    ];
  }
  if (Object.keys(personaWhere).length > 0) {
    where.persona = personaWhere;
  }

  const guardias = await prisma.opsGuardia.findMany({
    where,
    include: {
      persona: {
        select: {
          firstName: true,
          lastName: true,
          rut: true,
          phone: true,
          email: true,
          nationality: true,
          birthDate: true,
          gender: true,
        },
      },
      currentInstallation: { select: { name: true } },
    },
    take: limit,
    orderBy: { persona: { lastName: "asc" } },
  });

  return NextResponse.json({
    guardias: guardias.map((g) => ({
      id: g.id,
      code: g.code,
      status: g.status,
      lifecycleStatus: g.lifecycleStatus,
      rut: g.persona?.rut,
      firstName: g.persona?.firstName,
      lastName: g.persona?.lastName,
      phone: g.persona?.phone,
      email: g.persona?.email,
      nationality: g.persona?.nationality,
      birthDate: g.persona?.birthDate,
      gender: g.persona?.gender,
      currentInstallation: g.currentInstallation?.name,
      hiredAt: g.hiredAt,
      terminatedAt: g.terminatedAt,
    })),
  });
}
