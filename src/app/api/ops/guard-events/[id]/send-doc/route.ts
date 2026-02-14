import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

/**
 * POST /api/ops/guard-events/[id]/send-doc — Send document by email
 * Body: { documentId: string, ccEmails?: string[] }
 *
 * Flow:
 * 1. Load event + guard persona (email)
 * 2. Load Document instance
 * 3. Generate PDF from Document content
 * 4. Send via Resend to guard email + optional CC
 * 5. Log in DocHistory (action: "sent")
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

    if (!body.documentId) {
      return NextResponse.json(
        { success: false, error: "documentId es requerido" },
        { status: 400 },
      );
    }

    // TODO (Local phase): Full email implementation with Resend + DocHistory
    return NextResponse.json(
      { success: false, error: `Evento ${id} no encontrado (stub)` },
      { status: 404 },
    );
  } catch (error) {
    console.error("[OPS] Error sending document for guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo enviar el documento" },
      { status: 500 },
    );
  }
}
