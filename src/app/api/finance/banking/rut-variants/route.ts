import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { listRutVariantsInCartola } from "@/modules/finance/banking/rut-variants.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/banking/rut-variants?ruts=5.529.466-6,13.051.246-1
 * Variantes de glosa por RUT (banking_view). Cap 50. Sin ids de tx.
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

    const raw = request.nextUrl.searchParams.get("ruts") ?? "";
    const ruts = raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    if (ruts.length === 0) {
      return NextResponse.json(
        { success: false, error: "Indicá al menos un RUT" },
        { status: 400 },
      );
    }

    const data = await listRutVariantsInCartola(ctx.tenantId, ruts);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/Banking/RutVariants] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error",
      },
      { status: 500 },
    );
  }
}
