import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";

const OPS_ACTION_PREFIX = ["ops.pauta.", "ops.refuerzo.", "ops.refuerzos."];

function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const sp = request.nextUrl.searchParams;
    const installationId = (sp.get("installationId") || "").trim();
    const month = Math.max(1, Math.min(12, Number(sp.get("month") || 0) || new Date().getUTCMonth() + 1));
    const year = Math.max(2020, Number(sp.get("year") || 0) || new Date().getUTCFullYear());
    const take = Math.min(300, Math.max(20, Number(sp.get("take") || 120)));

    const { start, end } = monthRange(year, month);

    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        createdAt: { gte: start, lt: end },
        OR: OPS_ACTION_PREFIX.map((prefix) => ({
          action: { startsWith: prefix },
        })),
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        details: true,
        userId: true,
        userEmail: true,
        createdAt: true,
      },
    });

    const filtered = installationId
      ? logs.filter((log) => {
          const details = (log.details && typeof log.details === "object")
            ? (log.details as Record<string, unknown>)
            : {};
          const detailsInstallationId = typeof details.installationId === "string" ? details.installationId : null;
          return log.entityId === installationId || detailsInstallationId === installationId;
        })
      : logs;

    return NextResponse.json({
      success: true,
      data: filtered,
      meta: {
        installationId: installationId || null,
        month,
        year,
        total: filtered.length,
      },
    });
  } catch (error) {
    console.error("[OPS] Error fetching pauta activity:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener actividad de pauta" },
      { status: 500 }
    );
  }
}
