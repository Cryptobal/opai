import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { cloneDraftDte } from "@/modules/finance/billing/dte-draft.service";

/**
 * POST /api/finance/billing/drafts/[id]/duplicate
 *
 * Clona un borrador (DRAFT) en otro borrador independiente con los mismos
 * datos editables. No copia folio ni estado SII.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (
      !hasFacturacionCapability(perms, "facturacion_create_draft") &&
      !hasFacturacionCapability(perms, "facturacion_issue") &&
      !hasFacturacionCapability(perms, "facturacion_credit_note")
    ) {
      return NextResponse.json(
        { success: false, error: "Sin permiso para crear borradores" },
        { status: 403 },
      );
    }
    const { id } = await params;

    const draft = await cloneDraftDte(ctx.tenantId, ctx.userId, id);
    return NextResponse.json({ success: true, data: draft }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Billing] Draft duplicate error:", error);
    const message = error instanceof Error ? error.message : "Error al duplicar borrador";
    const status = message.includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
