import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/finance/cashflow/diagnostics
 *
 * Devuelve estadísticas de cobertura del módulo cashflow para el tenant
 * autenticado. Sirve para validar tras el deploy que sync esté activo:
 *
 *   - byCategory:       counts por categoría (cuántos items ↔ cuántas occurrences)
 *   - bySource:         counts por source (CONTRACT, PAYROLL, etc)
 *   - coverageContracts:contratos activos vs items materializados
 *   - coveragePayroll:  instalaciones con dotación vs items materializados
 *   - orphanItems:      items con categoría inexistente (no debería haber)
 *
 * Requiere capability cashflow_view (read-only, sin side-effects).
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_view")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  const tenantId = ctx.tenantId;

  // ── A1: items huérfanos (categoría inactiva o inexistente) ──
  const allActiveItems = await prisma.financeCashflowItem.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, source: true, categoryId: true },
  });
  const activeCategoryIds = new Set(
    (
      await prisma.financeCashflowCategory.findMany({
        where: { tenantId, isActive: true },
        select: { id: true },
      })
    ).map((c) => c.id),
  );
  const orphanItems = allActiveItems
    .filter((i) => !activeCategoryIds.has(i.categoryId))
    .map((i) => ({ id: i.id, name: i.name, source: i.source }));

  // ── A2: cobertura de contratos ──
  const [activeQuotes, contractItems] = await Promise.all([
    prisma.cpqQuote.count({
      where: {
        tenantId,
        status: { in: ["accepted", "active", "in_progress", "approved"] },
        contractStartDate: { not: null },
      },
    }),
    prisma.financeCashflowItem.count({
      where: { tenantId, source: "CONTRACT", isActive: true },
    }),
  ]);
  const coverageContracts = {
    activeQuotes,
    contractItems,
    gap: activeQuotes - contractItems,
  };

  // ── A3: cobertura de payroll ──
  const puestosRows = await prisma.opsPuestoOperativo.findMany({
    where: {
      tenantId,
      active: true,
      salaryStructureId: { not: null },
    },
    select: { installationId: true },
    distinct: ["installationId"],
  });
  const installationsWithDotacion = puestosRows.filter(
    (p) => p.installationId !== null,
  ).length;
  const payrollItems = await prisma.financeCashflowItem.count({
    where: { tenantId, source: "PAYROLL", isActive: true },
  });
  const coveragePayroll = {
    installationsWithDotacion,
    payrollItems,
    gap: installationsWithDotacion - payrollItems,
  };

  // ── Distribución por source ──
  const bySource: Record<string, { active: number; total: number }> = {};
  const sourceRows = await prisma.financeCashflowItem.groupBy({
    by: ["source", "isActive"],
    where: { tenantId },
    _count: { _all: true },
  });
  for (const r of sourceRows) {
    if (!bySource[r.source]) bySource[r.source] = { active: 0, total: 0 };
    bySource[r.source].total += r._count._all;
    if (r.isActive) bySource[r.source].active += r._count._all;
  }

  // ── Distribución por categoría ──
  const categories = await prisma.financeCashflowCategory.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, code: true, name: true, kind: true },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
  });
  const itemCountsByCat = await prisma.financeCashflowItem.groupBy({
    by: ["categoryId"],
    where: { tenantId, isActive: true },
    _count: { _all: true },
  });
  const itemCountMap = new Map(itemCountsByCat.map((r) => [r.categoryId, r._count._all]));
  const byCategory = categories.map((c) => ({
    code: c.code,
    name: c.name,
    kind: c.kind,
    activeItems: itemCountMap.get(c.id) ?? 0,
  }));

  return NextResponse.json({
    success: true,
    data: {
      tenantId,
      generatedAt: new Date().toISOString(),
      coverageContracts,
      coveragePayroll,
      bySource,
      byCategory,
      orphanItems,
      summary: {
        totalActiveItems: allActiveItems.length,
        contractsCovered: coverageContracts.gap === 0,
        payrollCovered: coveragePayroll.gap === 0,
        hasOrphans: orphanItems.length > 0,
      },
    },
  });
}
