/**
 * API Route: GET /api/finance/billing/accounts-with-dtes
 *
 * Devuelve la lista de cuentas CRM que tienen al menos un DTE emitido
 * por el tenant. Sirve al filtro "Centro de costo" de la tabla de DTEs
 * (UX 2.6).
 *
 * Como FinanceDte y CrmAccount no comparten relación Prisma (sólo FK
 * crmAccountId), primero consultamos los IDs distintos con DTEs y luego
 * traemos las cuentas correspondientes.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    // 1. IDs distintos de cuentas con DTEs emitidos.
    const distinct = await prisma.financeDte.findMany({
      where: {
        tenantId: ctx.tenantId,
        direction: "ISSUED",
        crmAccountId: { not: null },
      },
      select: { crmAccountId: true },
      distinct: ["crmAccountId"],
    });
    const accountIds = distinct
      .map((d) => d.crmAccountId)
      .filter((v): v is string => !!v);

    // 2. Lookup de cuentas, con tenant filtering.
    const accounts = accountIds.length > 0
      ? await prisma.crmAccount.findMany({
          where: { id: { in: accountIds }, tenantId: ctx.tenantId },
          select: { id: true, name: true, legalName: true },
          orderBy: { name: "asc" },
        })
      : [];

    return NextResponse.json({ success: true, data: accounts });
  } catch (error) {
    console.error("[Finance/Billing/AccountsWithDtes] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar cuentas" },
      { status: 500 },
    );
  }
}
