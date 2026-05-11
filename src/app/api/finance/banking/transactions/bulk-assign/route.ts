import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { setTransactionLinks } from "@/modules/finance/banking/bank-tx-link.service";
import { createRule } from "@/modules/finance/banking/automatch-rule.service";
import { findUnmappedAccounts } from "@/modules/finance/cashflow/categoryAccount.service";

const bulkAssignSchema = z.object({
  bankTransactionIds: z.array(z.string().uuid()).min(1).max(200),
  accountPlanId: z.string().uuid(),
  note: z.string().max(500).optional(),
  /** Si true, crea una FinanceAutoMatchRule basada en los movimientos seleccionados. */
  createRule: z.boolean().optional(),
  /** Nombre legible para la regla. Default: "Auto-asignado masivo". */
  ruleName: z.string().max(120).optional(),
});

/**
 * POST /api/finance/banking/transactions/bulk-assign
 * Asigna una cuenta contable a N movimientos en una operación masiva.
 *
 * Para cada tx: crea un link único EXPENSE/INCOME con accountPlanId y el monto
 * completo. Reemplaza links existentes (atómico por tx vía setTransactionLinks).
 *
 * Si createRule=true, computa una regla a partir de patrones comunes:
 *  - rango de montos (min, max) ± 10%
 *  - palabras comunes en la descripción (split y intersección)
 *  - appliesTo según signo (todos positivos → DEPOSIT, todos negativos → WITHDRAWAL, mix → BOTH)
 * Y la persiste en FinanceAutoMatchRule.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, bulkAssignSchema);
    if (parsed.error) return parsed.error;
    const { bankTransactionIds, accountPlanId, note, createRule: shouldCreateRule, ruleName } =
      parsed.data;

    // Validar que las txs pertenecen al tenant
    const txs = await prisma.financeBankTransaction.findMany({
      where: { id: { in: bankTransactionIds }, tenantId: ctx.tenantId, hiddenAt: null },
      select: { id: true, amount: true, description: true },
    });
    if (txs.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron movimientos" },
        { status: 404 },
      );
    }

    // Aplicar link a cada tx. Secuencial para evitar contention sobre los unique indexes.
    let assigned = 0;
    const errors: Array<{ id: string; error: string }> = [];
    for (const tx of txs) {
      const amountAbs = Math.abs(Number(tx.amount));
      const targetType: "INCOME" | "EXPENSE" = Number(tx.amount) > 0 ? "INCOME" : "EXPENSE";
      try {
        await setTransactionLinks(ctx.tenantId, tx.id, ctx.userId, [
          {
            targetType,
            targetId: null,
            amount: amountAbs,
            accountPlanId,
            note: note ?? null,
          },
        ]);
        assigned++;
      } catch (e) {
        errors.push({ id: tx.id, error: e instanceof Error ? e.message : "Error" });
      }
    }

    // Crear regla automática si lo pidieron
    let ruleCreated: { id: string; name: string } | null = null;
    if (shouldCreateRule && txs.length >= 2) {
      const amounts = txs.map((t) => Math.abs(Number(t.amount)));
      const minAmount = Math.floor(Math.min(...amounts) * 0.9);
      const maxAmount = Math.ceil(Math.max(...amounts) * 1.1);

      // Palabras comunes en la descripción (mayor a 3 letras, intersección)
      const wordSets = txs.map((t) => {
        const words = (t.description ?? "")
          .toUpperCase()
          .split(/\s+/)
          .filter((w) => w.length > 3 && /^[A-ZÁÉÍÓÚÑ]+$/.test(w));
        return new Set(words);
      });
      const commonWords =
        wordSets.length > 0
          ? Array.from(wordSets[0]).filter((w) =>
              wordSets.slice(1).every((s) => s.has(w)),
            )
          : [];
      const primaryWord = commonWords[0] ?? null;

      const allPositive = txs.every((t) => Number(t.amount) > 0);
      const allNegative = txs.every((t) => Number(t.amount) < 0);
      const appliesTo = allPositive ? "DEPOSITS" : allNegative ? "WITHDRAWALS" : "BOTH";

      const conditions = {
        mode: "ALL" as const,
        items: [
          ...(primaryWord
            ? [{ field: "DESCRIPTION" as const, operator: "CONTAINS" as const, value: primaryWord }]
            : []),
          {
            field: "AMOUNT" as const,
            operator: "AMOUNT_BETWEEN" as const,
            value: { min: minAmount, max: maxAmount },
          },
        ],
      };

      const created = await createRule(ctx.tenantId, ctx.userId, {
        name: ruleName?.trim() || `Auto-asignación ${primaryWord ?? "masiva"}`,
        enabled: true,
        priority: 100,
        appliesTo,
        conditions,
        action: {
          handlingMode: "CATEGORIZED",
          accountPlanId,
          requiresReview: false,
        },
      });
      ruleCreated = { id: created.id, name: created.name };
    }

    // Detectar si la cuenta asignada está sin mapping en cashflow
    let unmappedAccounts: Array<{ id: string; code: string; name: string }> = [];
    if (hasCapability(perms, "cashflow_view")) {
      unmappedAccounts = await findUnmappedAccounts(ctx.tenantId, [accountPlanId]);
    }

    return NextResponse.json({
      success: true,
      data: { assigned, errors, ruleCreated, unmappedAccounts },
    });
  } catch (error) {
    console.error("[Finance/Banking/BulkAssign] error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error" },
      { status: 500 },
    );
  }
}
