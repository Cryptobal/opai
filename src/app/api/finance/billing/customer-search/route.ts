/**
 * API Route: /api/finance/billing/customer-search
 * GET — Búsqueda ligera de clientes (CrmAccount) para autocompletar el receptor de un DTE.
 *
 * Auth: requiere `canView(perms, "finance", "facturacion")` (no requiere módulo CRM).
 * Si el tenant tiene CRM activo, esto reutiliza la base de clientes.
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

  const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10) || 20,
    50,
  );

  // Limpia separadores comunes del RUT para que "12.345.678-9" calce con "123456789".
  const rutNeedle = search.replace(/[.\-\s]/g, "");

  const accounts = await prisma.crmAccount.findMany({
    where: {
      tenantId: ctx.tenantId,
      type: "client",
      isActive: true,
      ...(search.length > 0 && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { legalName: { contains: search, mode: "insensitive" as const } },
          { rut: { contains: rutNeedle, mode: "insensitive" as const } },
        ],
      }),
    },
    select: {
      id: true,
      name: true,
      legalName: true,
      rut: true,
      address: true,
      commune: true,
    },
    orderBy: { name: "asc" },
    take: limit,
  });

  // Email del contacto primario (si existe).
  const accountIds = accounts.map((a) => a.id);
  const contacts = accountIds.length
    ? await prisma.crmContact.findMany({
        where: { accountId: { in: accountIds }, email: { not: null } },
        select: { accountId: true, email: true, isPrimary: true },
        orderBy: { isPrimary: "desc" },
      })
    : [];

  const emailByAccount = new Map<string, string>();
  for (const c of contacts) {
    if (c.email && !emailByAccount.has(c.accountId)) {
      emailByAccount.set(c.accountId, c.email);
    }
  }

  return NextResponse.json({
    success: true,
    data: accounts.map((a) => ({
      id: a.id,
      name: a.legalName ?? a.name,
      displayName: a.name,
      rut: a.rut ?? "",
      email: emailByAccount.get(a.id) ?? null,
      address: a.address ?? null,
      commune: a.commune ?? null,
      city: null as string | null,
    })),
  });
}
