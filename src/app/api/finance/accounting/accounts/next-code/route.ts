import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { suggestNextAccountCode } from "@/modules/finance/accounting/account-plan.service";

const VALID_TYPES = new Set(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "COST", "EXPENSE"]);

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const url = new URL(request.url);
    const type = (url.searchParams.get("type") ?? "").toUpperCase();
    const parentId = url.searchParams.get("parentId");

    if (!VALID_TYPES.has(type)) {
      return NextResponse.json(
        { success: false, error: "type inválido" },
        { status: 400 },
      );
    }

    const suggestion = await suggestNextAccountCode(
      ctx.tenantId,
      type,
      parentId && parentId !== "null" ? parentId : null,
    );
    return NextResponse.json({ success: true, data: suggestion });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al sugerir código";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
