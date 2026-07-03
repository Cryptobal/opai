import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  findDocumentsWithoutEntry,
  generateMissingEntries,
} from "@/modules/finance/accounting/accounting-health.service";

/**
 * POST /api/finance/accounting/health/generate
 * Genera los asientos faltantes. Acepta:
 *   { dteIds: string[] }        → genera solo esos documentos
 *   { year: number, month: number } → genera todos los huérfanos del período
 * Idempotente por documento (los que ya tienen asiento se saltan).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "contabilidad_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      dteIds?: unknown;
      year?: unknown;
      month?: unknown;
    };

    let ids: string[] = [];
    if (Array.isArray(body.dteIds)) {
      ids = body.dteIds.filter((x): x is string => typeof x === "string");
    } else if (typeof body.year === "number" && typeof body.month === "number") {
      const docs = await findDocumentsWithoutEntry(ctx.tenantId, {
        year: body.year,
        month: body.month,
      });
      ids = docs.map((d) => d.id);
    }

    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay documentos para generar asientos" },
        { status: 400 },
      );
    }

    const result = await generateMissingEntries(ctx.tenantId, ids, ctx.userId);

    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail ?? null,
      action: "CREATE",
      entity: "finance_accounting_health",
      details: {
        event: "generate_missing_entries",
        requested: ids.length,
        created: result.created,
        skipped: result.skipped,
        failed: result.failed,
        results: result.results,
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance Accounting Health Generate] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar asientos faltantes" },
      { status: 500 },
    );
  }
}
