import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { resolveAccountLogo } from "@/lib/crm/account-logo";

/**
 * GET /api/portal/cliente/clientes-destacados
 *
 * Muro de prueba social para la Presentación de Empresa: logos de las cuentas
 * activas del tenant que tengan logo. SOLO nombre + logo — NUNCA datos de
 * contacto (mail/teléfono) de terceros. Tenant resuelto desde la cookie.
 */
const MAX_LOGOS = 30;

export async function GET(request: NextRequest) {
  const auth = await requirePortalClienteAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const accounts = await prisma.crmAccount.findMany({
      where: {
        tenantId: auth.tenantId,
        status: "client_active",
        id: { not: auth.accountId }, // nunca incluir la propia cuenta del prospecto
      },
      select: { name: true, logoUrl: true, notes: true },
      orderBy: { name: "asc" },
    });

    const clients = accounts
      .map((a) => ({ name: a.name, logoUrl: resolveAccountLogo(a) }))
      .filter((c): c is { name: string; logoUrl: string } => Boolean(c.logoUrl))
      .slice(0, MAX_LOGOS);

    return NextResponse.json({ success: true, data: clients });
  } catch (error) {
    console.error("[PORTAL] clientes-destacados:", error);
    return NextResponse.json(
      { success: false, error: "Error cargando clientes" },
      { status: 500 },
    );
  }
}
