import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import { CONTRACT_CATEGORIES } from "@/lib/validations/docs";

/**
 * GET /api/crm/deals/[id]/contracts
 *
 * Contratos vinculados a un negocio (cruce contrato ↔ negocio). Consulta
 * inversa: parte de las DocAssociation(entityType=crm_deal, entityId=dealId)
 * y devuelve los documentos. Un mismo contrato paraguas que cubre varios
 * negocios aparece en la ficha de cada uno.
 *
 * Scoped por dealId + tenant (fail-closed).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmView(ctx, "deals");
  if (forbidden) return forbidden;

  const { id: dealId } = await params;

  try {
    // Verificamos que el negocio pertenezca al tenant antes de listar.
    const deal = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ success: true, data: [] });
    }

    const documents = await prisma.document.findMany({
      where: {
        tenantId: ctx.tenantId,
        module: "crm",
        category: { in: [...CONTRACT_CATEGORIES] },
        associations: {
          some: { entityType: "crm_deal", entityId: dealId },
        },
      },
      select: {
        id: true,
        uniqueId: true,
        title: true,
        category: true,
        status: true,
        effectiveDate: true,
        expirationDate: true,
        pdfUrl: true,
      },
      orderBy: [
        { expirationDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
    });

    const data = documents.map((d) => ({
      id: d.id,
      uniqueId: d.uniqueId,
      title: d.title,
      category: d.category,
      status: d.status,
      effectiveDate: d.effectiveDate
        ? d.effectiveDate.toISOString().slice(0, 10)
        : null,
      expirationDate: d.expirationDate
        ? d.expirationDate.toISOString().slice(0, 10)
        : null,
      pdfUrl: d.pdfUrl,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching deal contracts:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener contratos" },
      { status: 500 },
    );
  }
}
