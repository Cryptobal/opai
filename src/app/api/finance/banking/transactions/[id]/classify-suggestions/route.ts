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
import { recognizeRutsForTransactions } from "@/modules/finance/banking/rut-recognition.service";
import { loadPayrollCandidates } from "@/modules/finance/banking/payroll-candidates.service";
import {
  resolvePayrollFlowRows,
  resolveSupplierCategoryRow,
} from "@/modules/finance/banking/classify-flow-rows";
import { resolveAccountPlanIdForFlowRow } from "@/modules/finance/banking/flow-row-account-plan.service";
import {
  canReclassifyToFlowRow,
  reclassifyTransactionToFlowRow,
} from "@/modules/finance/banking/bank-tx-link.service";
import { normalizeNameForDedupe } from "@/modules/finance/flow-v3/row-visibility";
import { costCenterAssignmentSchema } from "@/modules/finance/banking/cost-allocation-math";
import { inferCostCenterFromClassifySource } from "@/modules/finance/banking/cost-allocation.service";

/** Ventana por defecto para liquidaciones/anticipos en la cascada. */
const PAYROLL_WINDOW_DAYS = 120;

const classifyBodySchema = z.object({
  kind: z.literal("FLOW_ROW"),
  flowRowId: z.string().uuid(),
  accountPlanId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).optional(),
  /** Ids adicionales a clasificar junto al de la ruta. Máx 200. */
  alsoBankTransactionIds: z.array(z.string().uuid()).max(200).optional(),
  /**
   * Origen de la sugerencia confirmada (cascada de clasificación).
   * Se mapea a FinanceLinkMatchSource en el link.
   */
  source: z
    .enum(["rule", "payroll", "te", "heuristic", "finiquito"])
    .optional(),
  matchedByRuleId: z.string().uuid().nullable().optional(),
  payrollKind: z
    .enum(["LIQUIDACION", "ANTICIPO", "FINIQUITO"])
    .optional(),
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
  costCenter: costCenterAssignmentSchema.optional(),
});

function matchSourceFromClassify(body: {
  source?: "rule" | "payroll" | "te" | "heuristic" | "finiquito";
  payrollKind?: "LIQUIDACION" | "ANTICIPO" | "FINIQUITO";
}): "RULE" | "PAYROLL" | "FINIQUITO" | "TURNO_EXTRA" | "INFERRED" | "MANUAL" {
  switch (body.source) {
    case "rule":
      return "RULE";
    case "te":
      return "TURNO_EXTRA";
    case "finiquito":
      return "FINIQUITO";
    case "payroll":
      return body.payrollKind === "FINIQUITO" ? "FINIQUITO" : "PAYROLL";
    case "heuristic":
      return "INFERRED";
    default:
      return "MANUAL";
  }
}

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

    const [identityMap, cfg, evaluation, payrollRows] = await Promise.all([
      recognizeRutsForTransactions(ctx.tenantId, [
        {
          id: tx.id,
          description: tx.description ?? null,
          reference: tx.reference ?? null,
        },
      ]),
      prisma.financeCashflowConfig.findUnique({
        where: { tenantId: ctx.tenantId },
        select: { matchAmountToleranceClp: true },
      }),
      findMatchingRule(ctx.tenantId, {
        amount,
        description: tx.description ?? "",
        reference: tx.reference,
      }),
      resolvePayrollFlowRows(ctx.tenantId),
    ]);

    const identity = identityMap.get(tx.id);
    const beneficiaryRut =
      normalizeClassifyRut(identity?.rut) ??
      normalizeClassifyRut(
        extractCanonicalRutFromBankText(tx.description ?? "") ??
          extractCanonicalRutFromBankText(tx.reference ?? ""),
      );
    const tol = cfg?.matchAmountToleranceClp ?? 5000;

    let ruleHit: {
      flowRowId: string;
      label: string;
      requiresReview: boolean;
      ruleName?: string;
    } | null = null;
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
          ruleName: flowSug.ruleName,
        };
      }
    } else if (evaluation && isFlowRowAction(evaluation.action)) {
      // already handled
    }

    const payrollCandidates =
      identity?.kind === "guardia" && identity.entityId
        ? (
            await loadPayrollCandidates(
              ctx.tenantId,
              [identity.entityId],
              PAYROLL_WINDOW_DAYS,
            )
          ).get(identity.entityId) ?? []
        : [];

    let supplierCategoryRow: { flowRowId: string; label: string } | null = null;
    let supplierCategoryName: string | null = null;
    if (identity?.kind === "supplier" && identity.entityId) {
      const resolved = await resolveSupplierCategoryRow(
        ctx.tenantId,
        identity.entityId,
      );
      if (resolved) {
        supplierCategoryRow = resolved.row;
        supplierCategoryName = resolved.categoryName;
      }
    }

    // DTE recibido pendiente por RUT emisor + monto ± tolerancia.
    let dteReceived: { dteId: string; label: string } | null = null;
    if (beneficiaryRut && amount < 0) {
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
      amountToleranceClp: tol,
      ruleHit,
      guardiaState: identity?.guardiaState ?? null,
      payrollCandidates,
      liquidacionRow: payrollRows.liquidacionRow,
      anticipoRow: payrollRows.anticipoRow,
      finiquitoRow: payrollRows.finiquitoRow,
      teRowId: payrollRows.teRow?.flowRowId ?? null,
      teRowLabel: payrollRows.teRow?.label,
      retiroSocioRow: payrollRows.retiroSocioRow,
      devolPrestamoSocioRow: payrollRows.devolPrestamoSocioRow,
      supplierCategoryRow,
      supplierCategoryName,
      dteReceived,
    });

    return NextResponse.json({
      success: true,
      data: {
        transactionId: tx.id,
        beneficiaryRut,
        amountAbs,
        identity: identity
          ? {
              kind: identity.kind,
              name: identity.entityName,
              guardiaState: identity.guardiaState ?? null,
              alsoRegisteredAs: identity.alsoRegisteredAs,
            }
          : null,
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

    if (
      body.costCenter?.mode === "SPLIT" &&
      body.costCenter.driver === "MANUAL" &&
      allIds.length > 1
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "El reparto manual no se puede aplicar a varios movimientos a la vez. Clasificá uno por uno o usá guardias activos / partes iguales.",
        },
        { status: 400 },
      );
    }

    const existingLinks = await prisma.financeBankTransactionLink.findMany({
      where: { tenantId: ctx.tenantId, bankTransactionId: { in: allIds } },
      select: { bankTransactionId: true, targetType: true },
    });
    const linksByTxId = new Map<
      string,
      Array<{ targetType: typeof existingLinks[number]["targetType"] }>
    >();
    for (const link of existingLinks) {
      const list = linksByTxId.get(link.bankTransactionId) ?? [];
      list.push({ targetType: link.targetType });
      linksByTxId.set(link.bankTransactionId, list);
    }

    const errors: Array<{ id: string; message: string }> = [];
    let classified = 0;

    for (const tx of txs) {
      const prevLinks = linksByTxId.get(tx.id) ?? [];
      if (prevLinks.length > 0 && !canReclassifyToFlowRow(prevLinks)) {
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
        let costCenter = body.costCenter;
        if (
          costCenter?.mode === "SPLIT" &&
          costCenter.driver === "MANUAL"
        ) {
          const missing = costCenter.installations.some(
            (i) => i.amount == null || !Number.isFinite(i.amount),
          );
          if (missing) {
            throw new Error(
              "Cada instalación en modo manual requiere un monto",
            );
          }
          const sum = costCenter.installations.reduce(
            (s, i) => s + Math.round(i.amount ?? 0),
            0,
          );
          if (sum !== Math.round(amountAbs)) {
            throw new Error(
              `El reparto manual ($${sum.toLocaleString("es-CL")}) no cuadra con el monto del movimiento ($${Math.round(amountAbs).toLocaleString("es-CL")})`,
            );
          }
        }
        if (costCenter === undefined && (body.source === "te" || body.source === "payroll")) {
          costCenter =
            (await inferCostCenterFromClassifySource({
              tenantId: ctx.tenantId,
              source: body.source,
              bankTx: {
                id: tx.id,
                amount: Number(tx.amount),
                description: tx.description,
                reference: tx.reference,
              },
            })) ?? { mode: "NONE" };
        }
        await reclassifyTransactionToFlowRow(ctx.tenantId, tx.id, ctx.userId, {
          targetType: isIncome ? "INCOME" : "EXPENSE",
          amount: amountAbs,
          accountPlanId,
          flowRowId: row.id,
          note:
            body.note ??
            `Clasificado a fila flujo: ${row.name} (${normalizeNameForDedupe(row.name)})`,
          matchSource: matchSourceFromClassify(body),
          matchedByRuleId: body.matchedByRuleId ?? null,
          costCenter,
        });
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
