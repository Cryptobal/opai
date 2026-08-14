import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { listInstallationsForAllocation } from "@/modules/finance/banking/cost-allocation.service";

export const runtime = "nodejs";

/**
 * GET /api/finance/banking/cost-allocation/installations
 * Instalaciones activas del tenant con dotación, para el selector de centro de costo.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const scopeParam = url.searchParams.get("scope") ?? "all";
    const scope = scopeParam === "account" ? "account" : "all";
    const accountId = url.searchParams.get("accountId");
    const q = url.searchParams.get("q");
    const includeIds = url.searchParams
      .getAll("includeId")
      .concat((url.searchParams.get("includeIds") ?? "").split(","))
      .map((s) => s.trim())
      .filter(Boolean);

    if (scope === "account" && !accountId) {
      return NextResponse.json(
        { success: false, error: "accountId requerido cuando scope=account" },
        { status: 400 },
      );
    }

    const data = await listInstallationsForAllocation({
      tenantId: ctx.tenantId,
      scope,
      accountId,
      q,
      includeIds,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/Banking/CostAllocation/Installations] GET:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar instalaciones" },
      { status: 500 },
    );
  }
}
