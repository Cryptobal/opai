/**
 * POST /api/finance/billing/preview-amounts
 *
 * Calcula los montos exactos que se enviarán al SII para un input dado,
 * SIN persistir nada. Es la fuente de verdad para el preview del DteForm
 * y CreditNoteForm: garantiza que los totales que ve el usuario en el
 * form coinciden 1:1 con los que se emiten al SII.
 *
 * Antes el cliente calculaba los totales con `IVA_RATE = 0.19` y el
 * server con `IVA_RATE = 19`. En CLP entero coincidían, pero en UF o
 * con descuentos había drift de centavos arrastrados ($1.000.000
 * mostrado por el form quedaba en $999.998 al emitir).
 *
 * El endpoint usa `strict: true` en CLP (rechaza decimales) para que el
 * usuario se entere AL TIRAR EL FORM, no al emitir al SII.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBody,
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { computeDteAmounts } from "@/modules/finance/billing/dte-amounts.helper";

const previewLineSchema = z.object({
  itemName: z.string().trim().min(1).max(200),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  unitPriceUf: z.number().positive().optional(),
  discountPct: z.number().min(0).max(100).optional(),
  isExempt: z.boolean().optional(),
});

const previewSchema = z.object({
  dteType: z
    .number()
    .int()
    .refine((v) => [33, 34, 39, 41, 52, 56, 61].includes(v), {
      message: "Tipo de DTE inválido",
    }),
  currency: z.enum(["CLP", "USD", "UF"]).default("CLP"),
  lines: z.array(previewLineSchema).min(1, "Debe incluir al menos una línea"),
  /**
   * En facturación recurrente con UF, el cliente puede pasar la UF que
   * usará en lugar de la UF del día (preview "como quedaría si se emite
   * con UF=$X"). En la emisión real NO se usa.
   */
  ufOverride: z.number().positive().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, previewSchema);
  if (parsed.error) return parsed.error;

  try {
    const calc = await computeDteAmounts(
      {
        dteType: parsed.data.dteType,
        currency: parsed.data.currency,
        // Mapeo defensivo a la shape que espera el helper.
        lines: parsed.data.lines.map((l) => ({
          itemName: l.itemName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unitPriceUf: l.unitPriceUf,
          discountPct: l.discountPct,
          isExempt: l.isExempt,
        })),
      },
      {
        strict: true,
        ufOverride: parsed.data.ufOverride,
      },
    );

    return NextResponse.json({
      success: true,
      data: {
        totalNet: calc.totalNet,
        totalExempt: calc.totalExempt,
        taxRate: calc.taxRate,
        taxAmount: calc.taxAmount,
        totalAmount: calc.totalAmount,
        ufValue: calc.ufValue,
        ufDate: calc.ufDate ? calc.ufDate.toISOString() : null,
        // Los netAmount por línea sirven para que el form pueda mostrar
        // el subtotal exacto sin recalcular (evita doble truth).
        lines: calc.lines.map((l) => ({
          itemName: l.itemName,
          unitPrice: l.unitPrice,
          netAmount: l.netAmount,
        })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error en preview",
      },
      { status: 400 },
    );
  }
}
