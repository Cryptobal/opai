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

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
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

    const url = new URL(request.url);
    const direction = url.searchParams.get("direction") === "RECEIVED" ? "RECEIVED" : "ISSUED";
    const includeInstallations = url.searchParams.get("include") === "installations";

    // 1. IDs distintos de cuentas con DTEs.
    const distinct = await prisma.financeDte.findMany({
      where: {
        tenantId: ctx.tenantId,
        direction,
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

    if (!includeInstallations) {
      return NextResponse.json({ success: true, data: accounts });
    }

    const distinctInstallations = await prisma.financeDte.findMany({
      where: {
        tenantId: ctx.tenantId,
        direction,
        installationId: { not: null },
      },
      select: { installationId: true },
      distinct: ["installationId"],
    });
    const installationIds = distinctInstallations
      .map((d) => d.installationId)
      .filter((v): v is string => !!v);
    const installations = installationIds.length > 0
      ? await prisma.crmInstallation.findMany({
          where: { id: { in: installationIds }, tenantId: ctx.tenantId },
          select: { id: true, name: true, commune: true },
          orderBy: { name: "asc" },
        })
      : [];

    return NextResponse.json({
      success: true,
      data: { accounts, installations },
    });
  } catch (error) {
    console.error("[Finance/Billing/AccountsWithDtes] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar cuentas" },
      { status: 500 },
    );
  }
}
