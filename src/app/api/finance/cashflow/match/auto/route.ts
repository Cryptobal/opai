import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { autoMatchSchema } from "@/lib/validations/cashflow";
import { buildProjection } from "@/modules/finance/cashflow/projection.service";
import { upsertOccurrence } from "@/modules/finance/cashflow/occurrence.service";
import { autoMatchOccurrencesToBankTx } from "@/modules/finance/cashflow/actuals-matcher";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, autoMatchSchema);
    if (parsed.error) return parsed.error;

    const projection = await buildProjection(ctx.tenantId, {
      from: parsed.data.from,
      to: parsed.data.to,
      granularity: "weekly",
    });

    // Persistir los matches que el account-matcher resolvió en buildProjection.
    // El account-matcher es puro (no escribe DB), acá lo materializamos.
    let accountMatched = 0;
    for (const b of projection.buckets) {
      for (const occ of b.occurrences) {
        if (
          occ.status === "PAID" &&
          occ.bankTransactionId &&
          occ.itemId &&
          occ.actualAmountClp !== null
        ) {
          await upsertOccurrence(ctx.tenantId, occ.itemId, occ.scheduledDate, {
            amountClp: occ.actualAmountClp,
            status: "PAID",
            bankTransactionId: occ.bankTransactionId,
            matchedBy: ctx.userId,
          });
          accountMatched++;
        }
      }
    }

    // Fallback heurístico: solo para ocurrencias que SIGUEN PROJECTED tras el
    // account matcher (manuales sin contraparte contable, o links sin
    // resolver de categoría).
    const stillProjected = projection.buckets.flatMap((b) =>
      b.occurrences.filter((o) => o.status === "PROJECTED" && !o.bankTransactionId),
    );
    const heuristic = await autoMatchOccurrencesToBankTx(
      ctx.tenantId,
      stillProjected,
      parsed.data.from,
      parsed.data.to,
      ctx.userId,
    );

    return NextResponse.json({
      success: true,
      data: {
        accountMatched,
        heuristicMatched: heuristic.matched,
        heuristicReviewed: heuristic.reviewed,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST match/auto:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
