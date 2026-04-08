import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { canView, hasCapability } from "@/lib/permissions";

/**
 * GET /api/ops/supervision/visit-heatmap?month=YYYY-MM
 *
 * Returns visit count grid by installation × day of month for the current
 * tenant. Used by the Hub HubVisitHeatmap component.
 */
export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule("ops_supervision");
  if (!modCheck.authorized) return modCheck.response;

  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para supervisión" },
        { status: 403 },
      );
    }

    const monthParam = request.nextUrl.searchParams.get("month");
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;

    if (monthParam) {
      const match = /^(\d{4})-(\d{1,2})$/.exec(monthParam);
      if (match) {
        year = Number(match[1]);
        month = Number(match[2]);
      }
    }

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const canViewAll = hasCapability(perms, "supervision_view_all");

    const visits = await prisma.opsVisitaSupervision.findMany({
      where: {
        tenantId: ctx.tenantId,
        checkInAt: { gte: monthStart, lt: monthEnd },
        ...(canViewAll ? {} : { supervisorId: ctx.userId }),
      },
      select: {
        installationId: true,
        checkInAt: true,
        installation: { select: { id: true, name: true } },
      },
    });

    // Aggregate counts by installation × day
    const installationMap = new Map<
      string,
      { id: string; name: string; counts: Map<number, number> }
    >();

    for (const v of visits) {
      const key = v.installationId;
      const day = new Date(v.checkInAt).getDate();
      if (!installationMap.has(key)) {
        installationMap.set(key, {
          id: v.installation.id,
          name: v.installation.name,
          counts: new Map(),
        });
      }
      const entry = installationMap.get(key)!;
      entry.counts.set(day, (entry.counts.get(day) ?? 0) + 1);
    }

    // Sort installations by total visits desc, top 20
    const installations = Array.from(installationMap.values())
      .sort((a, b) => {
        const sumA = Array.from(a.counts.values()).reduce((s, v) => s + v, 0);
        const sumB = Array.from(b.counts.values()).reduce((s, v) => s + v, 0);
        return sumB - sumA;
      })
      .slice(0, 20);

    const grid = installations.map((inst) =>
      days.map((d) => inst.counts.get(d) ?? 0),
    );

    return NextResponse.json({
      installations: installations.map((i) => ({ id: i.id, name: i.name })),
      days,
      grid,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error",
      },
      { status: 500 },
    );
  }
}
