import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClientReportAuth } from "@/lib/ops/client-report/auth";

/**
 * GET /api/ops/supervision/reportes/options
 * Cuentas e instalaciones activas para el generador de informes de visitas.
 */
export async function GET() {
  const gate = await requireClientReportAuth();
  if (!gate.ok) return gate.response;
  const { ctx } = gate.auth;

  const accounts = await prisma.crmAccount.findMany({
    where: {
      tenantId: ctx.tenantId,
      isActive: true,
      installations: { some: { status: "active" } },
    },
    select: {
      id: true,
      name: true,
      installations: {
        where: { status: "active" },
        select: { id: true, name: true, commune: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
    take: 400,
  });

  return NextResponse.json({
    success: true,
    data: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      installations: a.installations,
    })),
  });
}
