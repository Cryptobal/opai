import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/ops/guard-events — List guard events
 * Query params: guardiaId (required), category, status
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const guardiaId = request.nextUrl.searchParams.get("guardiaId");
    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const category = request.nextUrl.searchParams.get("category");
    const status = request.nextUrl.searchParams.get("status");

    const where: any = { tenantId: ctx.tenantId, guardiaId };
    if (category) where.category = category;
    if (status) where.status = status;

    const events = await prisma.opsGuardEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Enrich with creator names
    const userIds = [...new Set(events.map((e) => e.createdBy).filter(Boolean))];
    const users = userIds.length
      ? await prisma.admin.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const items = events.map((e) => ({
      ...e,
      attachments: (e.attachments as any[]) ?? [],
      metadata: (e.metadata as Record<string, unknown>) ?? {},
      vacationPaymentAmount: e.vacationPaymentAmount ? Number(e.vacationPaymentAmount) : null,
      pendingRemunerationAmount: e.pendingRemunerationAmount ? Number(e.pendingRemunerationAmount) : null,
      yearsOfServiceAmount: e.yearsOfServiceAmount ? Number(e.yearsOfServiceAmount) : null,
      substituteNoticeAmount: e.substituteNoticeAmount ? Number(e.substituteNoticeAmount) : null,
      totalSettlementAmount: e.totalSettlementAmount ? Number(e.totalSettlementAmount) : null,
      createdByName: userMap.get(e.createdBy) ?? null,
      approvedByName: e.approvedBy ? userMap.get(e.approvedBy) ?? null : null,
    }));

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing guard events:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los eventos laborales" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/ops/guard-events — Create a guard event
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    const { guardiaId, category, subtype } = body;
    if (!guardiaId || !category || !subtype) {
      return NextResponse.json(
        { success: false, error: "Campos requeridos: guardiaId, category, subtype" },
        { status: 400 },
      );
    }

    // Validate finiquito requires finiquitoDate
    if (category === "finiquito" && !body.finiquitoDate) {
      return NextResponse.json(
        { success: false, error: "Fecha de finiquito es requerida" },
        { status: 400 },
      );
    }

    // Validate ausencia requires startDate
    if (category === "ausencia" && !body.startDate) {
      return NextResponse.json(
        { success: false, error: "Fecha de inicio es requerida" },
        { status: 400 },
      );
    }

    const created = await prisma.opsGuardEvent.create({
      data: {
        tenantId: ctx.tenantId,
        guardiaId,
        category,
        subtype,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        totalDays: body.totalDays ?? null,
        finiquitoDate: body.finiquitoDate ? new Date(body.finiquitoDate) : null,
        causalDtCode: body.causalDtCode ?? null,
        causalDtLabel: body.causalDtLabel ?? null,
        vacationDaysPending: body.vacationDaysPending ?? null,
        vacationPaymentAmount: body.vacationPaymentAmount ?? null,
        pendingRemunerationAmount: body.pendingRemunerationAmount ?? null,
        yearsOfServiceAmount: body.yearsOfServiceAmount ?? null,
        substituteNoticeAmount: body.substituteNoticeAmount ?? null,
        totalSettlementAmount: body.totalSettlementAmount ?? null,
        reason: body.reason ?? null,
        internalNotes: body.internalNotes ?? null,
        attachments: body.attachments ?? [],
        status: body.status ?? "draft",
        createdBy: ctx.userId,
      },
    });

    // If finiquito is approved, update guard status
    if (category === "finiquito" && body.status === "approved" && body.finiquitoDate) {
      await prisma.opsGuardia.update({
        where: { id: guardiaId },
        data: {
          terminatedAt: new Date(body.finiquitoDate),
          terminationReason: body.causalDtLabel ?? "Finiquito",
          lifecycleStatus: "desvinculado",
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...created,
        attachments: (created.attachments as any[]) ?? [],
        metadata: (created.metadata as Record<string, unknown>) ?? {},
        vacationPaymentAmount: created.vacationPaymentAmount ? Number(created.vacationPaymentAmount) : null,
        pendingRemunerationAmount: created.pendingRemunerationAmount ? Number(created.pendingRemunerationAmount) : null,
        yearsOfServiceAmount: created.yearsOfServiceAmount ? Number(created.yearsOfServiceAmount) : null,
        substituteNoticeAmount: created.substituteNoticeAmount ? Number(created.substituteNoticeAmount) : null,
        totalSettlementAmount: created.totalSettlementAmount ? Number(created.totalSettlementAmount) : null,
        createdByName: null,
        approvedByName: null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error creating guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el evento laboral" },
      { status: 500 },
    );
  }
}
