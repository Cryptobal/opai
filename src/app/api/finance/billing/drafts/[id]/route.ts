import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { draftDteSchema } from "@/lib/validations/finance";
import {
  updateDraftDte,
  deleteDraftDte,
} from "@/modules/finance/billing/dte-draft.service";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;

    const draft = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId, siiStatus: "DRAFT" },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });
    if (!draft) {
      return NextResponse.json({ success: false, error: "Borrador no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: draft });
  } catch (error) {
    console.error("[Finance/Billing/Drafts] Get error:", error);
    return NextResponse.json({ success: false, error: "Error al obtener borrador" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
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
      return NextResponse.json({ success: false, error: "Sin permiso" }, { status: 403 });
    }
    const { id } = await params;
    const parsed = await parseBody(request, draftDteSchema);
    if (parsed.error) return parsed.error;

    const updated = await updateDraftDte(ctx.tenantId, id, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Finance/Billing/Drafts] Update error:", error);
    const message = error instanceof Error ? error.message : "Error al actualizar borrador";
    const status = message.includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(
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
      return NextResponse.json({ success: false, error: "Sin permiso" }, { status: 403 });
    }
    const { id } = await params;
    await deleteDraftDte(ctx.tenantId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Finance/Billing/Drafts] Delete error:", error);
    const message = error instanceof Error ? error.message : "Error al eliminar borrador";
    const status = message.includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
