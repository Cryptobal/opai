import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  findMatchingRule,
  flowRowSuggestionFromEvaluation,
  isFlowRowAction,
  upsertFlowRowRuleForDescription,
  upsertFlowRowRuleForRut,
} from "@/modules/finance/banking/automatch-rule.service";
import {
  normalizeClassifyRut,
  rankClassifySuggestions,
  isTgrRut,
  type ClassifySuggestion,
} from "@/modules/finance/banking/flow-classify.service";
import { extractCanonicalRutFromBankText } from "@/modules/finance/banking/rut-extract";
import { resolveAccountPlanIdForFlowRow } from "@/modules/finance/banking/flow-row-account-plan.service";
import { setTransactionLinks } from "@/modules/finance/banking/bank-tx-link.service";
import { normalizeNameForDedupe } from "@/modules/finance/flow-v3/row-visibility";

const classifyBodySchema = z.object({
  kind: z.literal("FLOW_ROW"),
  flowRowId: z.string().uuid(),
  accountPlanId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).optional(),
  /** Ids adicionales a clasificar junto al de la ruta. Máx 200. */
  alsoBankTransactionIds: z.array(z.string().uuid()).max(200).optional(),
  /**
   * RUT (default histórico), DESCRIPTION o NONE.
   * Compat: boolean true → RUT, false → NONE.
   */
  learnRule: z.preprocess((v) => {
    if (v === true) return "RUT";
    if (v === false) return "NONE";
    return v;
  }, z.enum(["RUT", "DESCRIPTION", "NONE"]).optional()),
  descriptionNeedle: z.string().trim().max(120).optional(),
});

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

    // DTE recibido pendiente por RUT emisor + monto ± tolerancia.
    let dteReceived: { dteId: string; label: string } | null = null;
    if (beneficiaryRut && amount < 0) {
      const cfg = await prisma.financeCashflowConfig.findUnique({
        where: { tenantId: ctx.tenantId },
        select: { matchAmountToleranceClp: true },
      });
      const tol = cfg?.matchAmountToleranceClp ?? 5000;
      const pending = await prisma.financeDte.findMany({
        where: {
          tenantId: ctx.tenantId,
          direction: "RECEIVED",
          paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
          voidedByCreditNoteId: null,
          issuerRut: { not: "" },
        },
        select: {
          id: true, folio: true, issuerName: true, issuerRut: true,
          totalAmount: true, amountPaid: true,
        },
        take: 200,
      });
      const hit = pending.find((d) => {
        const rut = normalizeClassifyRut(d.issuerRut);
        if (!rut || rut !== beneficiaryRut) return false;
        const pendingClp = Number(d.totalAmount) - Number(d.amountPaid);
        return Math.abs(pendingClp - amountAbs) <= tol;
      });
      if (hit) {
        dteReceived = {
          dteId: hit.id,
          label: `${hit.issuerName ?? "Proveedor"} F°${hit.folio}`,
        };
      }
    }

    const suggestions: ClassifySuggestion[] = rankClassifySuggestions({
      beneficiaryRut,
      amountAbs,
      ruleHit,
      teRowId: teRow?.id ?? null,
      teRowLabel: teRow?.name,
      payrollItem: null,
      dteReceived,
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
    const raw = await request.json();
    const parsed = classifyBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Body inválido",
        },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const alsoIds = body.alsoBankTransactionIds ?? [];
    const allIds = [...new Set([id, ...alsoIds])];
    if (allIds.length > 201) {
      return NextResponse.json(
        { success: false, error: "Máximo 200 transacciones adicionales por request" },
        { status: 400 },
      );
    }

    const txs = await prisma.financeBankTransaction.findMany({
      where: { id: { in: allIds }, tenantId: ctx.tenantId, hiddenAt: null },
      select: { id: true, amount: true, description: true, reference: true },
    });
    if (txs.length !== allIds.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Una o más transacciones no existen, están ocultas o no pertenecen al tenant",
        },
        { status: 400 },
      );
    }

    const row = await prisma.financeFlowRow.findFirst({
      where: { id: body.flowRowId, tenantId: ctx.tenantId, archivedAt: null },
      select: { id: true, name: true, section: true, categoryId: true },
    });
    if (!row) {
      return NextResponse.json({ success: false, error: "Fila no encontrada" }, { status: 404 });
    }

    const accountPlanId = await resolveAccountPlanIdForFlowRow(
      ctx.tenantId,
      row,
      body.accountPlanId ?? null,
    );
    if (!accountPlanId) {
      return NextResponse.json({
        success: false,
        error:
          "La fila no tiene cuenta contable asociada. Asigná una categoría con cuenta o enviá accountPlanId.",
      }, { status: 400 });
    }

    const learnMode = body.learnRule; // undefined = legacy default (RUT si hay)
    if (learnMode === "DESCRIPTION" && !body.descriptionNeedle?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "descriptionNeedle es obligatorio para learnRule DESCRIPTION",
        },
        { status: 400 },
      );
    }

    const existingLinks = await prisma.financeBankTransactionLink.findMany({
      where: { tenantId: ctx.tenantId, bankTransactionId: { in: allIds } },
      select: { bankTransactionId: true },
    });
    const withLinks = new Set(existingLinks.map((l) => l.bankTransactionId));

    const errors: Array<{ id: string; message: string }> = [];
    let classified = 0;

    for (const tx of txs) {
      if (withLinks.has(tx.id)) {
        errors.push({
          id: tx.id,
          message:
            "La transacción ya tiene vínculos de conciliación; no se sobrescribe",
        });
        continue;
      }
      try {
        const amountAbs = Math.abs(Number(tx.amount));
        const isIncome = Number(tx.amount) > 0;
        await setTransactionLinks(ctx.tenantId, tx.id, ctx.userId, [
          {
            targetType: isIncome ? "INCOME" : "EXPENSE",
            targetId: null,
            amount: amountAbs,
            accountPlanId,
            note:
              body.note ??
              `Clasificado a fila flujo: ${row.name} (${normalizeNameForDedupe(row.name)})`,
          },
        ]);
        classified++;
      } catch (e) {
        errors.push({
          id: tx.id,
          message: e instanceof Error ? e.message : "Error al clasificar",
        });
      }
    }

    let ruleLearned: { ruleId: string; created: boolean } | null = null;
    const primary =
      txs.find((t) => t.id === id) ?? txs[0]!;

    if (learnMode === "DESCRIPTION") {
      const appliesTo = row.section === "INGRESOS" ? "DEPOSITS" : "WITHDRAWALS";
      ruleLearned = await upsertFlowRowRuleForDescription({
        tenantId: ctx.tenantId,
        needle: body.descriptionNeedle!,
        flowRowId: row.id,
        rowName: row.name,
        appliesTo,
        userId: ctx.userId,
      });
    } else if (learnMode !== "NONE") {
      // Default histórico / "RUT": aprender por RUT si hay y no es TGR
      const rutFromText =
        extractCanonicalRutFromBankText(primary.description ?? "") ??
        extractCanonicalRutFromBankText(primary.reference ?? "");
      const rutCanon = normalizeClassifyRut(rutFromText);
      if (rutCanon && !isTgrRut(rutCanon)) {
        ruleLearned = await upsertFlowRowRuleForRut({
          tenantId: ctx.tenantId,
          rut: rutCanon,
          flowRowId: row.id,
          rowName: row.name,
          userId: ctx.userId,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        classified,
        failed: errors.length,
        errors,
        flowRowId: row.id,
        ruleId: ruleLearned?.ruleId ?? null,
        ruleCreated: ruleLearned?.created ?? false,
        /** Compat callers que esperaban transactionId / linked */
        transactionId: primary.id,
        linked: classified > 0,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/ClassifySuggestions] POST:", error);
    const message = error instanceof Error ? error.message : "Error al confirmar";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
