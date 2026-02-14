import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

/**
 * GET /api/ops/guard-events/[id] — Get event detail
 * PATCH /api/ops/guard-events/[id] — Update event (only draft/pending)
 *
 * TODO (Local phase): Replace stubs with Prisma queries
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    // STUB: return 404 until DB is ready
    return NextResponse.json(
      { success: false, error: `Evento ${id} no encontrado` },
      { status: 404 },
    );
  } catch (error) {
    console.error("[OPS] Error fetching guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el evento laboral" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    // TODO (Local phase): Validate editable status, update in DB
    return NextResponse.json(
      { success: false, error: `Evento ${id} no encontrado (stub)` },
      { status: 404 },
    );
  } catch (error) {
    console.error("[OPS] Error updating guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el evento laboral" },
      { status: 500 },
    );
  }
}
