import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

/**
 * POST /api/ops/guard-events/[id]/generate-doc — Generate document from template
 * Body: { templateId: string }
 *
 * Flow:
 * 1. Load event + guard data
 * 2. Load template
 * 3. Resolve tokens (guardia.*, labor_event.*, system.*)
 * 4. Create Document instance + DocAssociation(entity_type="guard_event")
 * 5. Return generated document metadata
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
    const body = await request.json();

    if (!body.templateId) {
      return NextResponse.json(
        { success: false, error: "templateId es requerido" },
        { status: 400 },
      );
    }

    // TODO (Local phase): Full implementation with token resolution + Document creation
    return NextResponse.json(
      { success: false, error: `Evento ${id} no encontrado (stub)` },
      { status: 404 },
    );
  } catch (error) {
    console.error("[OPS] Error generating document for guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo generar el documento" },
      { status: 500 },
    );
  }
}
