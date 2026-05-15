import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { bulkReconcileToDtes } from "@/modules/finance/banking/bank-tx-link.service";

const schema = z.object({
  bankTransactionIds: z.array(z.string().uuid()).min(1).max(50),
  /**
   * Cada allocation debe traer exactamente uno de `dteId` o
   * `factoringOperationId`. El servicio rechaza si vienen ambos o ninguno;
   * acá lo refinamos a nivel schema para que el cliente reciba el error
   * antes de hacer roundtrip.
   */
  allocations: z
    .array(
      z
        .object({
          dteId: z.string().uuid().optional(),
          factoringOperationId: z.string().uuid().optional(),
          amount: z.number().positive(),
        })
        .refine(
          (a) => !!a.dteId !== !!a.factoringOperationId,
          {
            message:
              "Cada allocation debe traer dteId o factoringOperationId (XOR)",
          },
        ),
    )
    .min(1)
    .max(20),
  /**
   * Diferencia entre el total bancario y la suma de allocations DTE.
   * Se contabiliza como un FinanceBankTransactionLink EXPENSE/INCOME con
   * la cuenta elegida sobre cada movimiento, prorrateado por peso. El
   * flag `prorateAcrossDteLines` instruye al servicio para que el
   * asiento contable distribuya el monto por los `accountId` de las
   * líneas de las facturas seleccionadas (ponderado por subtotal de
   * línea × asignación de factura).
   *
   * `direction`:
   *   - "surplus" (default): banco > sum(allocations) — comisión/ingreso
   *     extra que el banco entregó por sobre lo que cubren las facturas.
   *   - "shortfall": sum(allocations) < banco — típico factoring: el
   *     banco recibió neto, pero las facturas se asignan al bruto
   *     (PAID), y la diferencia se imputa como COSTO de factoring /
   *     retención. Asiento: DEBE Costo / HABER Banco.
   */
  differenceAllocation: z
    .object({
      accountPlanId: z.string().uuid(),
      amount: z.number().positive(),
      label: z.string().max(200).nullable().optional(),
      prorateAcrossDteLines: z.boolean().optional(),
      direction: z.enum(["surplus", "shortfall"]).optional(),
    })
    .optional(),
});

/**
 * POST /api/finance/banking/transactions/bulk-reconcile-dtes
 *
 * Concilia N movimientos contra M DTEs en una sola operación atómica.
 * Cada mov genera 1 PaymentRecord cuyo monto se reparte proporcionalmente
 * entre los DTEs según el peso de cada allocation.
 *
 * Body: { bankTransactionIds: string[], allocations: [{ dteId, amount }] }
 *
 * Caso típico: 1 depósito de factoring (neto) cubriendo M facturas cedidas
 * (brutas). El usuario decide cuánto se asigna a cada factura.
 */
export async function POST(request: NextRequest) {
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
    const parsed = await parseBody(request, schema);
    if (parsed.error) return parsed.error;

    const result = await bulkReconcileToDtes(
      ctx.tenantId,
      ctx.userId,
      parsed.data
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Banking/BulkReconcileDtes] Error:", error);
    const message =
      error instanceof Error ? error.message : "Error al conciliar";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
