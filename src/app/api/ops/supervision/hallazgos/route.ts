import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';
import { canView, hasCapability } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule('ops_supervision');
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const sp = request.nextUrl.searchParams;
    const statusFilter = sp.get("status") ?? "open";
    const severityFilter = sp.get("severity") ?? "all";
    const categoryFilter = sp.get("category") ?? "all";
    const installationFilter = sp.get("installationId") ?? "";
    const page = Math.max(1, parseInt(sp.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "25")));

    const canViewAll = hasCapability(perms, "supervision_view_all");

    // Build where clause
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
    };

    // Status filter
    if (statusFilter === "open") {
      where.status = { in: ["open", "in_progress"] };
    } else if (statusFilter !== "all") {
      where.status = statusFilter;
    }

    // Severity filter
    if (severityFilter !== "all") {
      where.severity = severityFilter;
    }

    // Category filter
    if (categoryFilter !== "all") {
      where.category = categoryFilter;
    }

    // Installation filter
    if (installationFilter) {
      where.installationId = installationFilter;
    }

    // Scope: non-admins only see findings from their visits
    if (!canViewAll) {
      where.visit = { supervisorId: ctx.userId };
    }

    // KPI base where (unfiltered by severity/category, always scoped)
    const kpiWhere: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      ...(!canViewAll ? { visit: { supervisorId: ctx.userId } } : {}),
    };

    const [items, total, totalOpen, totalCritical, resolvedFindings] = await Promise.all([
      // Main query
      prisma.opsSupervisionFinding.findMany({
        where,
        include: {
          installation: { select: { id: true, name: true } },
          visit: {
            select: {
              checkInAt: true,
              supervisor: { select: { name: true } },
            },
          },
          ticket: { select: { id: true, code: true, status: true, createdAt: true } },
          guard: { select: { persona: { select: { firstName: true, lastName: true } } } },
          tipoDoc: { select: { id: true, codigo: true, nombre: true, capa: true } },
        },
        orderBy: [
          { occurrenceCount: "desc" },
          { firstDetectedAt: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      // Total count for pagination
      prisma.opsSupervisionFinding.count({ where }),
      // KPI: total open
      prisma.opsSupervisionFinding.count({
        where: {
          ...kpiWhere,
          status: { in: ["open", "in_progress"] },
        },
      }),
      // KPI: total critical open
      prisma.opsSupervisionFinding.count({
        where: {
          ...kpiWhere,
          severity: "critical",
          status: { in: ["open", "in_progress"] },
        },
      }),
      // KPI: resolved findings for avg resolution time
      prisma.opsSupervisionFinding.findMany({
        where: {
          ...kpiWhere,
          status: { in: ["resolved", "verified"] },
          resolvedAt: { not: null },
        },
        select: { createdAt: true, resolvedAt: true },
        take: 200,
        orderBy: { resolvedAt: "desc" },
      }),
    ]);

    // Compute avg resolution hours
    const resolutionHours = resolvedFindings
      .filter((f) => f.resolvedAt)
      .map((f) => (f.resolvedAt!.getTime() - f.createdAt.getTime()) / (1000 * 60 * 60));
    const avgResolutionHours = resolutionHours.length > 0
      ? Math.round((resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length) * 10) / 10
      : null;

    return NextResponse.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        kpis: { totalOpen, totalCritical, avgResolutionHours },
      },
    });
  } catch (err: unknown) {
    // P2021: table does not exist — graceful degradation
    const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
    if (code === "P2021") {
      return NextResponse.json({
        success: true,
        data: {
          items: [],
          total: 0,
          page: 1,
          limit: 25,
          totalPages: 0,
          kpis: { totalOpen: 0, totalCritical: 0, avgResolutionHours: null },
        },
      });
    }
    console.error("[OPS][SUPERVISION] Error fetching hallazgos:", err);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los hallazgos" },
      { status: 500 },
    );
  }
}
