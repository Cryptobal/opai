import { NextRequest, NextResponse } from "next/server";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/agenda/cuentas?q=<term>
 * Typeahead liviano de cuentas CRM por nombre (o RUT), scoped al tenant.
 * Reutiliza el patrón `name contains insensitive` de /api/crm/accounts sin las
 * cargas pesadas (contract coverage / cashflow) que ese endpoint calcula.
 */
export async function GET(request: NextRequest) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;
  const url = new URL(request.url);
  // Resolución puntual por id: para mostrar el nombre de una cuenta prefijada.
  const id = url.searchParams.get("id");
  if (id) {
    const acc = await prisma.crmAccount.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, name: true, rut: true, type: true },
    });
    return NextResponse.json({ items: acc ? [acc] : [] });
  }

  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ items: [] });

  const items = await prisma.crmAccount.findMany({
    where: {
      tenantId: ctx.tenantId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { rut: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, rut: true, type: true },
    orderBy: { name: "asc" },
    take: 10,
  });
  return NextResponse.json({ items });
}
