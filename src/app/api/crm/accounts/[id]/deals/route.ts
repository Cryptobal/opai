import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";

/**
 * GET /api/crm/accounts/[id]/deals
 *
 * Lista liviana de los negocios de una cuenta para poblar el selector del
 * modal de subida de contrato. Devuelve la fecha de inicio del servicio
 * (`serviceStartDate`, la de la ficha del negocio) y las instalaciones
 * activadas por el negocio, de modo que al elegir un negocio el modal pueda
 * pre-rellenar fecha de inicio + instalaciones vinculadas.
 *
 * Scoped por accountId + tenant (fail-closed): si la cuenta no resuelve,
 * devuelve vacío, nunca los negocios de otra cuenta.
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

  const { id: accountId } = await params;

  try {
    const deals = await prisma.crmDeal.findMany({
      where: { tenantId: ctx.tenantId, accountId },
      select: {
        id: true,
        title: true,
        serviceStartDate: true,
        installationName: true,
        stage: { select: { name: true, isAccepted: true, isClosedWon: true } },
        activatedInstallations: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = deals.map((d) => ({
      id: d.id,
      title: d.title,
      serviceStartDate: d.serviceStartDate
        ? d.serviceStartDate.toISOString().slice(0, 10)
        : null,
      stageName: d.stage?.name ?? null,
      installations: d.activatedInstallations.map((i) => ({
        id: i.id,
        name: i.name,
      })),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching account deals:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener negocios" },
      { status: 500 },
    );
  }
}
