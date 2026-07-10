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
import { cleanRut } from "@/lib/chile-rut";

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
  // Filtro fuerte por RUT: cuando el caller pasa ?rut= solo retornamos
  // accounts cuyo RUT coincida exactamente (ignorando puntos/guion). Lo
  // usa el CostCenterEditor de un DTE emitido para que no se pueda elegir
  // un cliente con RUT distinto al receptor del DTE.
  const rutParam = request.nextUrl.searchParams.get("rut");
  const rutFilter = rutParam ? cleanRut(rutParam) : "";

  // Normaliza el RUT a solo dígitos+K (tolera puntos, guiones, espacios y
  // caracteres invisibles del XML SII) para que "12.345.678-9" calce con
  // "123456789". Un needle vacío (ej: búsqueda por nombre) NO se aplica al
  // filtro por RUT para no matchear todas las cuentas con `contains ""`.
  const rutNeedle = cleanRut(search);

  const accounts = await prisma.crmAccount.findMany({
    where: {
      tenantId: ctx.tenantId,
      type: "client",
      isActive: true,
      // Cuando hay rutFilter usamos contains con la versión normalizada;
      // la igualdad estricta se aplica post-query (la DB puede guardar
      // RUTs con o sin formato y `contains` cubre ambos casos).
      ...(rutFilter ? { rut: { contains: rutFilter, mode: "insensitive" as const } } : {}),
      ...(search.length > 0 && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { legalName: { contains: search, mode: "insensitive" as const } },
          ...(rutNeedle
            ? [{ rut: { contains: rutNeedle, mode: "insensitive" as const } }]
            : []),
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
      // city y giro: se autocompletan al receptor del DTE para cumplir con
      // el bloque <Receptor> del SII (Comuna + Ciudad + Giro).
      city: true,
      giro: true,
      // industry: actividad/sector comercial interno del CRM. Sirve de
      // fallback para autocompletar el campo "Giro / Actividad" del
      // receptor cuando `giro` está vacío.
      industry: true,
    },
    orderBy: { name: "asc" },
    take: limit,
  });

  // Si rutFilter está, exigimos igualdad estricta con la versión normalizada
  // (DB puede tener RUTs con/sin puntos/guión — el `contains` es permisivo
  // y podría devolver false positives tipo "1234567" matching "12345678").
  const filteredAccounts = rutFilter
    ? accounts.filter((a) => cleanRut(a.rut ?? "") === rutFilter)
    : accounts;

  // Email del contacto primario (si existe).
  const accountIds = filteredAccounts.map((a) => a.id);
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
    data: filteredAccounts.map((a) => ({
      id: a.id,
      name: a.legalName ?? a.name,
      displayName: a.name,
      rut: a.rut ?? "",
      email: emailByAccount.get(a.id) ?? null,
      address: a.address ?? null,
      commune: a.commune ?? null,
      city: a.city ?? null,
      giro: a.giro ?? null,
      industry: a.industry ?? null,
    })),
  });
}
