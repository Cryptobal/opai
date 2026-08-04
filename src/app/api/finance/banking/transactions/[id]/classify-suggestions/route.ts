import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { findMatchingRule, flowRowSuggestionFromEvaluation, isFlowRowAction } from "@/modules/finance/banking/automatch-rule.service";
import {
  normalizeClassifyRut,
  rankClassifySuggestions,
  type ClassifySuggestion,
} from "@/modules/finance/banking/flow-classify.service";
import { extractCanonicalRutFromBankText } from "@/modules/finance/banking/rut-recognition.service";
import { setTransactionLinks } from "@/modules/finance/banking/bank-tx-link.service";
import { normalizeNameForDedupe } from "@/modules/finance/flow-v3/row-visibility";

/**
 * GET /api/finance/banking/transactions/[id]/classify-suggestions
 * Cascada RUT → sugerencias de clasificación (regla / TGR / nómina / TE / DTE).
 *
 * POST confirma una sugerencia FLOW_ROW creando link INCOME|EXPENSE
 * (accountPlanId opcional vía body) — stub mínimo; UI quick-picks follow-up.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const tx = await prisma.financeBankTransaction.findFirst({
      where: { id, tenantId: ctx.tenantId, hiddenAt: null },
      select: { id: true, amount: true, description: true, reference: true },
    });
    if (!tx) {
      return NextResponse.json({ success: false, error: "Tx no encontrada" }, { status: 404 });
    }

    const amount = Number(tx.amount);
    const amountAbs = Math.abs(amount);
    const rutFromText =
      extractCanonicalRutFromBankText(tx.description ?? "") ??
      extractCanonicalRutFromBankText(tx.reference ?? "");
    const beneficiaryRut = normalizeClassifyRut(rutFromText);

    const evaluation = await findMatchingRule(ctx.tenantId, {
      amount,
      description: tx.description ?? "",
      reference: tx.reference,
    });
    let ruleHit: { flowRowId: string; label: string; requiresReview: boolean } | null = null;
    const flowSug = flowRowSuggestionFromEvaluation(evaluation);
    if (flowSug) {
      const row = await prisma.financeFlowRow.findFirst({
        where: { id: flowSug.flowRowId, tenantId: ctx.tenantId },
        select: { id: true, name: true },
      });
      if (row) {
        ruleHit = {
          flowRowId: row.id,
          label: row.name,
          requiresReview: flowSug.requiresReview,
        };
      }
    } else if (evaluation && isFlowRowAction(evaluation.action)) {
      // already handled
    }

    const teRow = await prisma.financeFlowRow.findFirst({
      where: {
        tenantId: ctx.tenantId,
        archivedAt: null,
        OR: [
          { name: { equals: "Turnos extra", mode: "insensitive" } },
          { name: { equals: "Turno extra", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true },
    });

    // Stub: payroll/DTE resolution queda para follow-up; cascada pura aún cubre TGR/regla/TE/NONE.
    const suggestions: ClassifySuggestion[] = rankClassifySuggestions({
      beneficiaryRut,
      amountAbs,
      ruleHit,
      teRowId: teRow?.id ?? null,
      teRowLabel: teRow?.name,
      payrollItem: null,
      dteReceived: null,
    });

    return NextResponse.json({
      success: true,
      data: {
        transactionId: tx.id,
        beneficiaryRut,
        amountAbs,
        suggestions,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/ClassifySuggestions] GET:", error);
    return NextResponse.json(
      { success: false, error: "Error al clasificar" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const body = (await request.json()) as {
      kind?: string;
      flowRowId?: string;
      accountPlanId?: string | null;
      note?: string;
    };

    if (body.kind !== "FLOW_ROW" || !body.flowRowId) {
      return NextResponse.json(
        { success: false, error: "Stub: solo FLOW_ROW confirmado por ahora" },
        { status: 400 },
      );
    }

    const tx = await prisma.financeBankTransaction.findFirst({
      where: { id, tenantId: ctx.tenantId, hiddenAt: null },
      select: { id: true, amount: true },
    });
    if (!tx) {
      return NextResponse.json({ success: false, error: "Tx no encontrada" }, { status: 404 });
    }

    const row = await prisma.financeFlowRow.findFirst({
      where: { id: body.flowRowId, tenantId: ctx.tenantId },
      select: { id: true, name: true, section: true },
    });
    if (!row) {
      return NextResponse.json({ success: false, error: "Fila no encontrada" }, { status: 404 });
    }

    // Link INCOME/EXPENSE exige accountPlanId en bank-tx-link. Sin él,
    // devolvemos confirmación tipada (UI quick-picks / regla follow-up).
    if (!body.accountPlanId) {
      return NextResponse.json({
        success: true,
        data: {
          stub: true,
          transactionId: tx.id,
          flowRowId: row.id,
          flowRowName: row.name,
          message:
            "Sugerencia aceptada. Pasá accountPlanId para crear el vínculo contable.",
        },
      });
    }

    const amountAbs = Math.abs(Number(tx.amount));
    const isIncome = Number(tx.amount) > 0;
    await setTransactionLinks(
      ctx.tenantId,
      id,
      ctx.userId,
      [
        {
          targetType: isIncome ? "INCOME" : "EXPENSE",
          targetId: null,
          amount: amountAbs,
          accountPlanId: body.accountPlanId,
          note:
            body.note ??
            `Clasificado a fila flujo: ${row.name} (${normalizeNameForDedupe(row.name)})`,
        },
      ],
    );

    return NextResponse.json({
      success: true,
      data: { transactionId: tx.id, flowRowId: row.id, linked: true },
    });
  } catch (error) {
    console.error("[Finance/Banking/ClassifySuggestions] POST:", error);
    const message = error instanceof Error ? error.message : "Error al confirmar";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
