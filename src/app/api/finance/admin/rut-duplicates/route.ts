import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { listDuplicateRuts } from "@/modules/finance/banking/rut-conflict-detector";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/admin/rut-duplicates
 *
 * Lista RUTs duplicados dentro y cross-tabla del tenant.
 * Solo accesible para roles con banking_manage.
 */
export async function GET(_request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }
    const duplicates = await listDuplicateRuts(ctx.tenantId);
    return NextResponse.json({ success: true, data: duplicates });
  } catch (error) {
    console.error("[Finance/Admin/RutDuplicates] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar duplicados" },
      { status: 500 },
    );
  }
}
