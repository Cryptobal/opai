/**
 * GET /api/fiscalizacion/info-empleador
 * Información del empleador para fiscalización DT (Resolución N°38)
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const allowedRoles = ["owner", "admin", "inspector_dt"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const [configEmpresa, tenant, incidents, jornadaConfig] = await Promise.all([
    prisma.configEmpresa.findFirst({
      where: { tenantId: session.user.tenantId },
    }),
    prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true, slug: true, active: true, createdAt: true },
    }),
    prisma.systemIncident.findMany({
      where: {
        tenantId: session.user.tenantId,
        resolvedAt: null,
      },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
    prisma.configJornada.findFirst({
      where: {
        tenantId: session.user.tenantId,
        vigenciaDesde: { lte: new Date() },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: new Date() } }],
      },
      orderBy: { vigenciaDesde: "desc" },
    }),
  ]);

  return NextResponse.json({
    empresa: configEmpresa
      ? {
          rut: configEmpresa.rut,
          razonSocial: configEmpresa.razonSocial,
          direccionPrincipal: configEmpresa.direccionPrincipal,
          representanteLegal: configEmpresa.representanteLegal,
          giroComercial: configEmpresa.giroComercial,
        }
      : null,
    sistema: {
      nombre: "OPAI Suite",
      version: process.env.npm_package_version || "1.0.0",
      tenantName: tenant?.name,
      tenantActive: tenant?.active,
      upSince: tenant?.createdAt,
    },
    jornadaVigente: jornadaConfig
      ? {
          maxHorasSemanales: jornadaConfig.maxHorasSemanales,
          maxHorasDiarias: jornadaConfig.maxHorasDiarias,
          maxHorasExtras: jornadaConfig.maxHorasExtras,
          leyReferencia: jornadaConfig.leyReferencia,
          vigenciaDesde: jornadaConfig.vigenciaDesde,
        }
      : null,
    incidentesAbiertos: incidents.length,
  });
}
