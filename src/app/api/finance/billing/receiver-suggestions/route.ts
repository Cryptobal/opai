/**
 * GET /api/finance/billing/receiver-suggestions?rut=XX.XXX.XXX-X
 *
 * Devuelve sugerencias para autocompletar el receptor de un DTE basado
 * en datos del CRM:
 *   - account: razón social, dirección, comuna, RUT
 *   - contacts: lista de [{ nombre, role, email }] asociados al account
 *
 * Útil cuando el usuario empieza a escribir un RUT en DteForm: si ya
 * existe un account/contactos en el CRM con ese RUT, los muestra como
 * dropdown para autocompletar el receptor + emails CC con un click.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/** Normaliza el RUT a la forma `<cuerpo>-<dv>` con DV en mayúscula. */
function normalizeRut(raw: string): string {
  const clean = raw.replace(/[^\dKk]/g, "").toUpperCase();
  if (clean.length < 2) return "";
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

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

  const rutRaw = request.nextUrl.searchParams.get("rut") ?? "";
  const rut = normalizeRut(rutRaw);
  if (!rut || rut.length < 8) {
    return NextResponse.json({
      success: true,
      data: { account: null, contacts: [] },
    });
  }

  // Buscar account por RUT (case-insensitive en el DV K).
  const account = await prisma.crmAccount.findFirst({
    where: { tenantId: ctx.tenantId, rut },
    select: {
      id: true,
      name: true,
      legalName: true,
      rut: true,
      address: true,
      commune: true,
      // city y giro se agregaron al CrmAccount para autocompletar el
      // bloque <Receptor> del DTE (SII exige ambos en facturas 33/34).
      city: true,
      giro: true,
      // industry: fallback para "Giro / Actividad" cuando giro está vacío.
      industry: true,
    },
  });

  if (!account) {
    return NextResponse.json({
      success: true,
      data: { account: null, contacts: [] },
    });
  }

  const contacts = await prisma.crmContact.findMany({
    where: { tenantId: ctx.tenantId, accountId: account.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      roleTitle: true,
      isPrimary: true,
    },
    orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }],
  });

  return NextResponse.json({
    success: true,
    data: {
      account: {
        id: account.id,
        name: account.legalName ?? account.name,
        commercialName: account.name,
        rut: account.rut,
        address: account.address,
        commune: account.commune,
        city: account.city,
        giro: account.giro,
        industry: account.industry,
      },
      contacts: contacts
        .filter((c) => c.email && c.email.includes("@"))
        .map((c) => ({
          id: c.id,
          fullName: `${c.firstName} ${c.lastName}`.trim(),
          email: c.email!,
          roleTitle: c.roleTitle,
          isPrimary: c.isPrimary,
        })),
    },
  });
}
