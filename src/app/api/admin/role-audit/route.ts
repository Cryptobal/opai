/**
 * GET /api/admin/role-audit
 * Matriz efectiva de acceso financiero por usuario activo del tenant.
 * Solo owner/admin. Los valores son post-lock (no el JSON del template).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import {
  canView,
  hasCapability,
  hasFacturacionCapability,
  isOwnerOrAdminRole,
} from "@/lib/permissions";
import { resolvePermissions } from "@/lib/permissions-server";
import {
  type FinancialAuditMatrix,
  type FinancialAuditRow,
} from "@/lib/financial-access";

function matrixFromPerms(
  perms: Awaited<ReturnType<typeof resolvePermissions>>,
): FinancialAuditMatrix {
  return {
    deals: canView(perms, "crm", "deals"),
    quotes: canView(perms, "crm", "quotes"),
    cpq: canView(perms, "cpq"),
    payroll: canView(perms, "payroll"),
    cashflow_view: hasCapability(perms, "cashflow_view"),
    banking_view: hasCapability(perms, "banking_view"),
    purchases_view: hasCapability(perms, "purchases_view"),
    facturacion_view: hasFacturacionCapability(perms, "facturacion_view"),
    reports_finance_view: hasCapability(perms, "reports_finance_view"),
    rendiciones: canView(perms, "finance", "rendiciones"),
  };
}

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  if (!isOwnerOrAdminRole(ctx.userRole)) {
    return NextResponse.json(
      { success: false, error: "Solo owner o admin pueden ver la auditoría de acceso financiero" },
      { status: 403 },
    );
  }

  const admins = await prisma.admin.findMany({
    where: { tenantId: ctx.tenantId, status: "active" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      roleTemplateId: true,
      roleTemplate: { select: { name: true, slug: true } },
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  const rows: FinancialAuditRow[] = [];
  for (const admin of admins) {
    const perms = await resolvePermissions({
      role: admin.role,
      roleTemplateId: admin.roleTemplateId,
    });
    rows.push({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      templateName: admin.roleTemplate?.name ?? null,
      templateSlug: admin.roleTemplate?.slug ?? null,
      matrix: matrixFromPerms(perms),
    });
  }

  return NextResponse.json({ success: true, data: rows });
}
