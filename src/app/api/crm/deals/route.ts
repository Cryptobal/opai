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
import {
  listCrmDeals,
  type DealsFocus,
  type DealListSort,
  DEAL_LIST_DEFAULT_PAGE_SIZE,
} from "@/lib/crm/list-deals";
import { triggerFollowUpProcessing } from "@/lib/followup-selfheal";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "deals");
    if (forbidden) return forbidden;

    const sp = request.nextUrl.searchParams;
    const search = sp.get("search") || undefined;
    const stageId = sp.get("stageId") || undefined;
    const focusRaw = sp.get("focus");
    const focus = (
      focusRaw === "all"
      || focusRaw === "proposals-sent-30d"
      || focusRaw === "won-after-proposal-30d"
      || focusRaw === "followup-open"
      || focusRaw === "followup-overdue"
        ? focusRaw
        : "all"
    ) as DealsFocus;
    const sortRaw = sp.get("sort");
    const sort = (
      sortRaw === "az" || sortRaw === "za" || sortRaw === "newest" || sortRaw === "oldest"
        ? sortRaw
        : undefined
    ) as DealListSort | undefined;
    const limitRaw = sp.get("limit") ?? sp.get("pageSize");
    const pageRaw = sp.get("page");
    const paginated = limitRaw != null || pageRaw != null;

    // Legacy (sin page/limit): respuesta liviana para dropdowns / bundle dialog.
    // El listado CRM siempre manda page/limit y usa listCrmDeals enriquecido.
    if (!paginated) {
      const deals = await prisma.crmDeal.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(stageId && stageId !== "all" ? { stageId } : {}),
          ...(search?.trim()
            ? {
                OR: [
                  { title: { contains: search.trim(), mode: "insensitive" as const } },
                  { account: { name: { contains: search.trim(), mode: "insensitive" as const } } },
                ],
              }
            : {}),
        },
        include: {
          account: {
            select: { id: true, name: true, type: true, status: true },
          },
          stage: true,
          primaryContact: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ success: true, data: deals });
    }

    if (focus === "followup-overdue") {
      triggerFollowUpProcessing();
    }

    const result = await listCrmDeals({
      tenantId: ctx.tenantId,
      focus,
      stageId,
      search,
      sort,
      page: pageRaw != null ? Number.parseInt(pageRaw, 10) : 1,
      pageSize: limitRaw != null ? Number.parseInt(limitRaw, 10) : DEAL_LIST_DEFAULT_PAGE_SIZE,
    });

    return NextResponse.json({
      success: true,
      data: result.deals,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
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
        isLicitacion: Boolean(body.isLicitacion),
        fechaEntrega: body.isLicitacion && body.fechaEntrega
          ? new Date(`${body.fechaEntrega}T12:00:00Z`)
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

    // Auto-apertura de sala desde la Oportunidad (Fase 3): default OFF; abre solo
    // si el tenant lo activó y el negocio supera el umbral. Best-effort, no bloquea.
    try {
      const { maybeAutoOpenDealRoom } = await import("@/lib/integrations/slack/deal-rooms/room");
      await maybeAutoOpenDealRoom(ctx.tenantId, deal.id, ctx.userId);
    } catch (e) {
      console.error("[slack] auto-open deal room on create failed:", e);
    }

    // Licitaciones: carpeta Drive anticipada (bases llegan por fuera de OPAI).
    if (deal.isLicitacion) {
      void import("@/lib/google-workspace/drive-deal-folder").then(({ ensureLicitacionDriveFolder }) =>
        ensureLicitacionDriveFolder(ctx.tenantId, deal.id),
      );
    }

    return NextResponse.json({ success: true, data: deal }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM deal:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create deal" },
      { status: 500 }
    );
  }
}
