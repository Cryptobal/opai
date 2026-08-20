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
} from "@/modules/finance/banking/automatch-rule.service";
import {
  normalizeClassifyRut,
  rankClassifySuggestions,
  type ClassifySuggestion,
} from "@/modules/finance/banking/flow-classify.service";
import { recognizeRutsForTransactions } from "@/modules/finance/banking/rut-recognition.service";
import { loadPayrollCandidates } from "@/modules/finance/banking/payroll-candidates.service";
import {
  resolvePayrollFlowRows,
  resolveSupplierCategoryRow,
  laborClassByStaffRuts,
} from "@/modules/finance/banking/classify-flow-rows";

const PAYROLL_WINDOW_DAYS = 120;
const MAX_IDS = 300;

const bodySchema = z.object({
  bankTransactionIds: z
    .array(z.string().uuid())
    .min(1, "Se requiere al menos un id")
    .max(MAX_IDS, `Máximo ${MAX_IDS} transacciones por request`),
});

function serializeSuggestion(s: ClassifySuggestion) {
  if (s.kind === "FLOW_ROW") {
    return {
      kind: s.kind,
      flowRowId: s.flowRowId,
      label: s.label,
      reason: s.reason,
      source: s.source,
      requiresReview: s.requiresReview ?? true,
    };
  }
  if (s.kind === "TGR_PICK") {
    return {
      kind: s.kind,
      label: "Tesorería",
      reason: s.reason,
      source: "heuristic" as const,
      options: s.options,
    };
  }
  if (s.kind === "SOCIO_PICK") {
    return {
      kind: s.kind,
      label: "Socio / persona",
      reason: s.reason,
      source: "heuristic" as const,
      options: s.options,
    };
  }
  if (s.kind === "DTE_RECEIVED") {
    return {
      kind: s.kind,
      dteId: s.dteId,
      label: s.label,
      reason: s.reason,
      source: "heuristic" as const,
    };
  }
  return {
    kind: "NONE" as const,
    label: null,
    reason: s.reason,
    source: null,
  };
}

/**
 * POST /api/finance/banking/transactions/classify-suggestions/batch
 * Identidad + sugerencia de clasificación para hasta 300 movimientos.
 * Solo lectura — nunca escribe.
 */
export async function POST(request: NextRequest) {
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

    const raw = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Body inválido",
        },
        { status: 400 },
      );
    }

    const ids = [...new Set(parsed.data.bankTransactionIds)];
    const txs = await prisma.financeBankTransaction.findMany({
      where: {
        id: { in: ids },
        tenantId: ctx.tenantId,
        hiddenAt: null,
      },
      select: {
        id: true,
        amount: true,
        description: true,
        reference: true,
      },
    });

    if (txs.length !== ids.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Una o más transacciones no existen, están ocultas o no pertenecen al tenant",
        },
        { status: 400 },
      );
    }

    const [identityMap, cfg, payrollRows, pendingDtes] = await Promise.all([
      recognizeRutsForTransactions(
        ctx.tenantId,
        txs.map((t) => ({
          id: t.id,
          description: t.description ?? null,
          reference: t.reference ?? null,
        })),
      ),
      prisma.financeCashflowConfig.findUnique({
        where: { tenantId: ctx.tenantId },
        select: { matchAmountToleranceClp: true },
      }),
      resolvePayrollFlowRows(ctx.tenantId),
      prisma.financeDte.findMany({
        where: {
          tenantId: ctx.tenantId,
          direction: "RECEIVED",
          paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
          voidedByCreditNoteId: null,
          issuerRut: { not: "" },
        },
        select: {
          id: true,
          folio: true,
          issuerName: true,
          issuerRut: true,
          totalAmount: true,
          amountPaid: true,
        },
        take: 500,
      }),
    ]);

    const tol = cfg?.matchAmountToleranceClp ?? 5000;

    const guardiaIds = [
      ...new Set(
        [...identityMap.values()]
          .filter((i) => i.kind === "guardia" && i.entityId)
          .map((i) => i.entityId!),
      ),
    ];
    const payrollByGuardia = await loadPayrollCandidates(
      ctx.tenantId,
      guardiaIds,
      PAYROLL_WINDOW_DAYS,
    );

    const supplierIds = [
      ...new Set(
        [...identityMap.values()]
          .filter((i) => i.kind === "supplier" && i.entityId)
          .map((i) => i.entityId!),
      ),
    ];
    const supplierCategoryById = new Map<
      string,
      { row: { flowRowId: string; label: string }; categoryName: string }
    >();
    await Promise.all(
      supplierIds.map(async (sid) => {
        const resolved = await resolveSupplierCategoryRow(ctx.tenantId, sid);
        if (resolved) supplierCategoryById.set(sid, resolved);
      }),
    );

    const staffRuts = [
      ...new Set(
        [...identityMap.values()]
          .map((i) => normalizeClassifyRut(i.rut))
          .filter((r): r is string => !!r),
      ),
    ];
    const staffClassMap = await laborClassByStaffRuts(ctx.tenantId, staffRuts);

    // Preservar orden del request (ids dedupe).
    const txById = new Map(txs.map((t) => [t.id, t]));
    const results = [];

    for (const id of ids) {
      const tx = txById.get(id)!;
      const amount = Number(tx.amount);
      const amountAbs = Math.abs(amount);
      const identity = identityMap.get(id);
      const beneficiaryRut = normalizeClassifyRut(identity?.rut);

      const evaluation = await findMatchingRule(ctx.tenantId, {
        amount,
        description: tx.description ?? "",
        reference: tx.reference,
      });
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
      }

      const payrollCandidates =
        identity?.kind === "guardia" && identity.entityId
          ? payrollByGuardia.get(identity.entityId) ?? []
          : [];

      let supplierCategoryRow: { flowRowId: string; label: string } | null =
        null;
      let supplierCategoryName: string | null = null;
      if (identity?.kind === "supplier" && identity.entityId) {
        const resolved = supplierCategoryById.get(identity.entityId);
        if (resolved) {
          supplierCategoryRow = resolved.row;
          supplierCategoryName = resolved.categoryName;
        }
      }

      let dteReceived: { dteId: string; label: string } | null = null;
      if (beneficiaryRut && amount < 0) {
        const hit = pendingDtes.find((d) => {
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

      const laborClass =
        identity?.kind === "guardia"
          ? "OPERATIVO"
          : (staffClassMap.get(beneficiaryRut ?? "") ?? null);

      const suggestions = rankClassifySuggestions({
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
        laborClass,
        liquidacionAdminRow: payrollRows.liquidacionAdminRow,
        anticipoAdminRow: payrollRows.anticipoAdminRow,
      });

      const primary = suggestions[0] ?? {
        kind: "NONE" as const,
        reason: "Sin identidad conocida para este RUT",
      };

      results.push({
        id: tx.id,
        rut: beneficiaryRut,
        identity: {
          kind: identity?.kind ?? "unknown",
          name: identity?.entityName ?? null,
          guardiaState: identity?.guardiaState ?? null,
          alsoRegisteredAs: identity?.alsoRegisteredAs ?? [],
        },
        suggestion: serializeSuggestion(primary),
      });
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("[Finance/Banking/ClassifySuggestions/Batch] POST:", error);
    return NextResponse.json(
      { success: false, error: "Error al clasificar en lote" },
      { status: 500 },
    );
  }
}
