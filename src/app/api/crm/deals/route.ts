/**
 * API Route: /api/crm/deals
 * GET  - Listar negocios
 * POST - Crear negocio
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";
import { createDealSchema } from "@/lib/validations/crm";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { requireTenantModule } from '@/lib/require-module';

export async function GET() {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "deals");
    if (forbidden) return forbidden;

    const deals = await prisma.crmDeal.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
        stage: true,
        primaryContact: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: deals });
  } catch (error) {
    console.error("Error fetching CRM deals:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch deals" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "deals");
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createDealSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const stage =
      body.stageId ||
      (await prisma.crmPipelineStage.findFirst({
        where: { tenantId: ctx.tenantId, isActive: true },
        orderBy: { order: "asc" },
        select: { id: true },
      }))?.id;

    if (!stage) {
      return NextResponse.json(
        { success: false, error: "No hay etapas de pipeline configuradas" },
        { status: 400 }
      );
    }

    const deal = await prisma.crmDeal.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: body.accountId,
        primaryContactId: body.primaryContactId || null,
        title: body.title || "Negocio sin título",
        amount: body.amount,
        stageId: stage,
        probability: body.probability,
        expectedCloseDate: body.expectedCloseDate
          ? new Date(body.expectedCloseDate)
          : null,
        status: "open",
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
        stage: true,
        primaryContact: true,
      },
    });

    await prisma.crmDealStageHistory.create({
      data: {
        tenantId: ctx.tenantId,
        dealId: deal.id,
        fromStageId: null,
        toStageId: stage,
        changedBy: ctx.userId,
      },
    });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "deal",
      entityId: deal.id,
      action: "deal_created",
      details: {
        title: deal.title,
        amount: deal.amount,
        stageId: deal.stage?.id ?? stage,
        accountId: deal.account?.id ?? body.accountId,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: deal }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM deal:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create deal" },
      { status: 500 }
    );
  }
}
