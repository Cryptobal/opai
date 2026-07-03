import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { findDocumentsWithoutEntry } from "@/modules/finance/accounting/accounting-health.service";

/**
 * GET /api/finance/accounting/health?year=&month=
 * Lista los documentos emitidos sin asiento (huérfanos), opcionalmente
 * acotados a un período.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "accounting_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const yearRaw = searchParams.get("year");
    const monthRaw = searchParams.get("month");
    const range =
      yearRaw && monthRaw
        ? { year: parseInt(yearRaw, 10), month: parseInt(monthRaw, 10) }
        : undefined;

    const documents = await findDocumentsWithoutEntry(ctx.tenantId, range);
    return NextResponse.json({
      success: true,
      data: { documents, count: documents.length },
    });
  } catch (error) {
    console.error("[Finance Accounting Health] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener salud contable" },
      { status: 500 },
    );
  }
}
