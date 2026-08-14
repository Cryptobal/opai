/** GET /api/crm/deals/[id]/licitacion-docs — checklist documental de licitación. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { requireTenantModule } from "@/lib/require-module";
import { listDealLicitacionDocs } from "@/modules/crm/documents/licitacion-ingest.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "crm", "deals") && !canView(perms, "crm")) {
    return NextResponse.json({ error: "Sin acceso al negocio" }, { status: 403 });
  }

  const { id } = await params;
  const deal = await prisma.crmDeal.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, isLicitacion: true, title: true },
  });
  if (!deal) {
    return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  }

  const data = await listDealLicitacionDocs(ctx.tenantId, deal.id);
  return NextResponse.json({ success: true, data: { ...data, isLicitacion: deal.isLicitacion } });
}
