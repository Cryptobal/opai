import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  listTransactionLinks,
  setTransactionLinks,
  clearTransactionLinks,
} from "@/modules/finance/banking/bank-tx-link.service";

const linkSchema = z.object({
  targetType: z.enum([
    "DTE_ISSUED",
    "DTE_RECEIVED",
    "PAYROLL_LIQUIDACION",
    "PAYROLL_ANTICIPO",
    "TE_LOTE",
    "TE_ITEM",
    "TE_TURNO",
    "EXPENSE",
    "INCOME",
    "FACTORING_OPERATION",
  ]),
  targetId: z.string().nullable().optional(),
  amount: z.number().positive(),
  accountPlanId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const setLinksSchema = z.object({
  links: z.array(linkSchema),
  allowPartial: z.boolean().optional(),
});

/**
 * GET /api/finance/banking/transactions/[id]/links
 *
 * Devuelve `{ links, paymentRecord, reconciliationStatus }`:
 *   - `links` ya viene enriquecido con `entityLabel` y datos del DTE /
 *     factoring / cuenta contable cuando aplica (ver
 *     EnrichedTransactionLink en bank-tx-link.service.ts).
 *   - `paymentRecord` es el FinancePaymentRecord más reciente creado
 *     por la conciliación de esta tx (cuando hay links DTE). Se usa
 *     en el drawer "Conciliar movimiento" para mostrar el resumen
 *     read-only "Pago COB-000123 registrado el ..." con link al recibo.
 *   - `reconciliationStatus` permite al cliente decidir si pintar la
 *     vista resumen (MATCHED) o el flujo de creación (UNMATCHED).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }
    const { id } = await params;
    const [links, tx, paymentRecord] = await Promise.all([
      listTransactionLinks(ctx.tenantId, id),
      prisma.financeBankTransaction.findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: { reconciliationStatus: true },
      }),
      prisma.financePaymentRecord.findFirst({
        where: { tenantId: ctx.tenantId, bankTransactionId: id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          type: true,
          date: true,
          amount: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        links,
        paymentRecord: paymentRecord
          ? {
              id: paymentRecord.id,
              code: paymentRecord.code,
              type: paymentRecord.type,
              date: paymentRecord.date.toISOString(),
              amount: paymentRecord.amount.toNumber(),
              status: paymentRecord.status,
              createdAt: paymentRecord.createdAt.toISOString(),
            }
          : null,
        reconciliationStatus: tx?.reconciliationStatus ?? "UNMATCHED",
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/Links] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar vínculos" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/finance/banking/transactions/[id]/links
 * Reemplaza la lista completa de vínculos. Mejor que POST/DELETE separados:
 * el cliente arma la lista final y la manda atómicamente.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }
    const { id } = await params;
    const parsed = await parseBody(request, setLinksSchema);
    if (parsed.error) return parsed.error;

    await setTransactionLinks(
      ctx.tenantId,
      id,
      ctx.userId,
      parsed.data.links,
      { allowPartial: parsed.data.allowPartial ?? false }
    );

    // Detectar cuentas contables sin mapping en flujo de caja
    // (importante: solo si el usuario tiene cashflow_view, sino no abrimos el modal)
    let unmappedAccounts: Array<{ id: string; code: string; name: string }> = [];
    if (hasCapability(perms, "cashflow_view")) {
      const accountIds = Array.from(
        new Set(
          parsed.data.links
            .map((l) => l.accountPlanId)
            .filter((x): x is string => !!x)
        )
      );
      if (accountIds.length > 0) {
        const { findUnmappedAccounts } = await import(
          "@/modules/finance/cashflow/categoryAccount.service"
        );
        unmappedAccounts = await findUnmappedAccounts(ctx.tenantId, accountIds);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        // Si hay cuentas sin mapping, el front muestra el modal CategoryMappingDialog
        // para resolverlas. Si está vacío, el link ya quedó completo.
        unmappedAccounts,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking/Links] PUT error:", error);
    const message =
      error instanceof Error ? error.message : "Error al guardar vínculos";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/finance/banking/transactions/[id]/links
 * Elimina todos los vínculos y deja la tx UNMATCHED.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }
    const { id } = await params;
    await clearTransactionLinks(ctx.tenantId, id);
    return NextResponse.json({ success: true, data: { ok: true } });
  } catch (error) {
    console.error("[Finance/Banking/Links] DELETE error:", error);
    const message =
      error instanceof Error ? error.message : "Error al desconciliar";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
