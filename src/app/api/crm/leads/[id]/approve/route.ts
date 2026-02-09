/**
 * API Route: /api/crm/leads/[id]/approve
 * POST - Aprobar prospecto y convertir a cliente + contacto + negocio
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
    const userId = session?.user?.id;
    const body = await request.json();

    const lead = await prisma.crmLead.findFirst({
      where: { id: params.id, tenantId },
    });

    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead no encontrado" },
        { status: 404 }
      );
    }

    if (lead.status === "approved") {
      return NextResponse.json(
        { success: false, error: "Lead ya aprobado" },
        { status: 400 }
      );
    }

    const accountName =
      body?.accountName?.trim() ||
      lead.companyName?.trim() ||
      lead.name?.trim() ||
      "Cliente sin nombre";

    const contactName =
      body?.contactName?.trim() ||
      lead.name?.trim() ||
      "Contacto principal";

    const pipelineStage = await prisma.crmPipelineStage.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { order: "asc" },
    });

    if (!pipelineStage) {
      return NextResponse.json(
        { success: false, error: "No hay etapas de pipeline configuradas" },
        { status: 400 }
      );
    }

    const dealTitle =
      body?.dealTitle?.trim() || `Oportunidad ${accountName}`;

    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.crmAccount.create({
        data: {
          tenantId,
          name: accountName,
          rut: body?.rut?.trim() || null,
          industry: body?.industry?.trim() || null,
          size: body?.size?.trim() || null,
          segment: body?.segment?.trim() || null,
          website: body?.website?.trim() || null,
          address: body?.address?.trim() || null,
          notes: body?.accountNotes?.trim() || lead.notes || null,
          ownerId: userId || null,
        },
      });

      const contact = await tx.crmContact.create({
        data: {
          tenantId,
          accountId: account.id,
          name: contactName,
          email: body?.email?.trim() || lead.email || null,
          phone: body?.phone?.trim() || lead.phone || null,
          roleTitle: body?.roleTitle?.trim() || null,
          isPrimary: true,
        },
      });

      const deal = await tx.crmDeal.create({
        data: {
          tenantId,
          accountId: account.id,
          primaryContactId: contact.id,
          title: dealTitle,
          amount: body?.amount ? Number(body.amount) : 0,
          stageId: pipelineStage.id,
          probability: body?.probability ? Number(body.probability) : 0,
          expectedCloseDate: body?.expectedCloseDate
            ? new Date(body.expectedCloseDate)
            : null,
          status: "open",
        },
      });

      await tx.crmDealStageHistory.create({
        data: {
          tenantId,
          dealId: deal.id,
          fromStageId: null,
          toStageId: pipelineStage.id,
          changedBy: userId || null,
        },
      });

      await tx.crmLead.update({
        where: { id: lead.id },
        data: {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: userId || null,
          convertedAccountId: account.id,
          convertedContactId: contact.id,
          convertedDealId: deal.id,
        },
      });

      await tx.crmHistoryLog.create({
        data: {
          tenantId,
          entityType: "lead",
          entityId: lead.id,
          action: "lead_approved",
          details: {
            accountId: account.id,
            contactId: contact.id,
            dealId: deal.id,
          },
          createdBy: userId || null,
        },
      });

      return { account, contact, deal };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error approving CRM lead:", error);
    return NextResponse.json(
      { success: false, error: "Failed to approve lead" },
      { status: 500 }
    );
  }
}
