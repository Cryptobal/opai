import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const forbidden = await ensureOpsAccess(ctx);
  if (forbidden) return forbidden;

  const { tenantId } = ctx;

  const [total, withAddress, withCoords] = await Promise.all([
    prisma.opsPersona.count({
      where: {
        tenantId,
        guardia: { lifecycleStatus: { in: ["contratado", "seleccionado"] } },
      },
    }),
    prisma.opsPersona.count({
      where: {
        tenantId,
        guardia: { lifecycleStatus: { in: ["contratado", "seleccionado"] } },
        addressFormatted: { not: null },
      },
    }),
    prisma.opsPersona.count({
      where: {
        tenantId,
        guardia: { lifecycleStatus: { in: ["contratado", "seleccionado"] } },
        lat: { not: null },
        lng: { not: null },
      },
    }),
  ]);

  const pending = withAddress - withCoords;
  const coverage = withAddress > 0 ? Math.round((withCoords / withAddress) * 100) : 0;

  return NextResponse.json({
    success: true,
    data: {
      totalGuardias: total,
      conDireccion: withAddress,
      conCoordenadas: withCoords,
      sinCoordenadas: pending,
      sinDireccion: total - withAddress,
      coberturaGeocoding: coverage,
    },
  });
}
