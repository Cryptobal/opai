import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

/**
 * POST /api/ops/guard-events/[id]/approve — Approve a guard event
 *
 * Side effects (TODO Local phase):
 * - Update event status to "approved"
 * - applyEventToPauta(): paint V/L/P on monthly schedule
 * - For finiquito: deactivate guard assignments
 * - Send notification email to guard
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    // TODO (Local phase): Load event, validate status=pending, approve, apply to pauta
    return NextResponse.json(
      { success: false, error: `Evento ${id} no encontrado (stub)` },
      { status: 404 },
    );
  } catch (error) {
    console.error("[OPS] Error approving guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo aprobar el evento laboral" },
      { status: 500 },
    );
  }
}
