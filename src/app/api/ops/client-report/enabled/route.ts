import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireVisitReportAuth } from "@/lib/ops/client-report/auth";

/** Lista compacta de instalaciones con informe automático activo. */
export async function GET() {
  const gate = await requireVisitReportAuth();
  if (!gate.ok) return gate.response;
  const { ctx } = gate.auth;

  const rows = await prisma.opsClientReportConfig.findMany({
    where: { tenantId: ctx.tenantId, enabled: true },
    select: {
      frequency: true,
      weekday: true,
      dayOfMonth: true,
      lastSentAt: true,
      lastPeriodKey: true,
      installation: {
        select: {
          id: true,
          name: true,
          account: { select: { name: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      installationId: r.installation.id,
      installationName: r.installation.name,
      accountName: r.installation.account?.name ?? null,
      frequency: r.frequency,
      weekday: r.weekday,
      dayOfMonth: r.dayOfMonth,
      lastSentAt: r.lastSentAt?.toISOString() ?? null,
      lastPeriodKey: r.lastPeriodKey,
    })),
  });
}
