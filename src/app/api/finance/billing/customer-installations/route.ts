/**
 * API Route: /api/finance/billing/customer-installations?accountId=UUID
 * GET — Lista instalaciones (CrmInstallation) de un cliente CRM dado.
 *
 * Usado por DteForm cuando el usuario selecciona un cliente del CRM
 * para mostrar el dropdown de instalaciones (centro de costo).
 *
 * Auth: requiere `canView(perms, "finance", "facturacion")`. No requiere
 * módulo CRM activo — el endpoint reusa los datos sin importar permisos
 * de CRM (es solo lectura mínima para vincular DTEs).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "facturacion")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json(
      { success: false, error: "Falta accountId" },
      { status: 400 },
    );
  }

  const installations = await prisma.crmInstallation.findMany({
    where: {
      tenantId: ctx.tenantId,
      accountId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      address: true,
      commune: true,
      city: true,
      status: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ success: true, data: installations });
}
