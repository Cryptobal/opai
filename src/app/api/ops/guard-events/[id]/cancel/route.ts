import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

/**
 * POST /api/ops/guard-events/[id]/cancel — Cancel/annul a guard event
 * Body: { reason?: string }
 *
 * Side effects (TODO Local phase):
 * - revertEventFromPauta(): revert V/L/P back to T
 * - Validate no locked attendance rows in date range
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    // TODO (Local phase): Load event, validate status, cancel, revert pauta
    return NextResponse.json(
      { success: false, error: `Evento ${id} no encontrado (stub)` },
      { status: 404 },
    );
  } catch (error) {
    console.error("[OPS] Error cancelling guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo anular el evento laboral" },
      { status: 500 },
    );
  }
}
