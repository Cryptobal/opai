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
  createDraftDte,
  listDraftDtes,
} from "@/modules/finance/billing/dte-draft.service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20")));
    const search = url.searchParams.get("search") || undefined;

    const result = await listDraftDtes(ctx.tenantId, { page, pageSize, search });
    return NextResponse.json({
      success: true,
      data: {
        drafts: result.drafts,
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      },
    });
  } catch (error) {
    console.error("[Finance/Billing/Drafts] List error:", error);
    return NextResponse.json({ success: false, error: "Error al listar borradores" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const parsed = await parseBody(request, draftDteSchema);
    if (parsed.error) return parsed.error;

    const { ufOverride, ...draftInput } = parsed.data;
    const draft = await createDraftDte(ctx.tenantId, ctx.userId, draftInput, {
      ufOverride: ufOverride ?? undefined,
    });
    return NextResponse.json({ success: true, data: draft }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Billing/Drafts] Create error:", error);
    const message = error instanceof Error ? error.message : "Error al crear borrador";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
