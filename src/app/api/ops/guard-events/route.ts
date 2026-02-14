import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { GuardEvent } from "@/lib/guard-events";

/**
 * GET /api/ops/guard-events — List guard events
 * Query params: guardiaId (required), category, status, from, to
 *
 * TODO (Local phase): Replace stub with Prisma query on OpsGuardEvent
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

    // STUB: return empty array until DB migration
    const items: GuardEvent[] = [];

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
 *
 * Body: { guardiaId, category, subtype, startDate, endDate?, reason?, ... }
 *
 * TODO (Local phase): Prisma create + overlap validation + audit
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    // Basic validation
    const { guardiaId, category, subtype, startDate } = body;
    if (!guardiaId || !category || !subtype || !startDate) {
      return NextResponse.json(
        { success: false, error: "Campos requeridos: guardiaId, category, subtype, startDate" },
        { status: 400 },
      );
    }

    // TODO (Local phase): Check overlap, create in DB
    // For now, return a stub response
    const now = new Date().toISOString();
    const stubEvent: GuardEvent = {
      id: crypto.randomUUID(),
      tenantId: ctx.tenantId,
      guardiaId,
      category: body.category,
      subtype: body.subtype,
      startDate: body.startDate,
      endDate: body.endDate ?? null,
      totalDays: body.totalDays ?? null,
      isPartialDay: false,
      status: body.status ?? "draft",
      causalDtCode: body.causalDtCode ?? null,
      causalDtLabel: body.causalDtLabel ?? null,
      reason: body.reason ?? null,
      internalNotes: body.internalNotes ?? null,
      attachments: body.attachments ?? [],
      metadata: {},
      requestId: null,
      createdBy: ctx.userId,
      createdByName: null,
      approvedBy: null,
      approvedByName: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      cancelledBy: null,
      cancelledAt: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
      documents: [],
    };

    return NextResponse.json({ success: true, data: stubEvent }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error creating guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el evento laboral" },
      { status: 500 },
    );
  }
}
