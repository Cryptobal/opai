import { z } from "zod";
import type { ProjectionMatrix } from "./types";
import { buildProjection } from "./projection.service";

/** Parse yyyy-MM-dd → Date UTC (mismo criterio que fechas de cuota en el módulo). */
export function parseYmdUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Rango opcional pedido por el cliente tras una mutación.
 * Span máximo 5 semanas (guard anti-abuso). Fechas yyyy-MM-dd.
 */
export const returnRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from debe ser yyyy-MM-dd"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to debe ser yyyy-MM-dd"),
  })
  .superRefine((v, ctx) => {
    const from = parseYmdUtc(v.from);
    const to = parseYmdUtc(v.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      ctx.addIssue({ code: "custom", message: "Fechas inválidas" });
      return;
    }
    if (from.getTime() > to.getTime()) {
      ctx.addIssue({ code: "custom", message: "from debe ser ≤ to" });
      return;
    }
    const days = (to.getTime() - from.getTime()) / 86_400_000;
    if (days > 35) {
      ctx.addIssue({
        code: "custom",
        message: "returnRange no puede exceder 5 semanas",
      });
    }
  });

export type ReturnRange = z.infer<typeof returnRangeSchema>;

/** Campo opcional para componer con schemas Zod de mutación. */
export const returnRangeField = z.object({
  returnRange: returnRangeSchema.optional(),
});

/**
 * Proyección semanal acotada al rango (misma serialización que GET projection:
 * NextResponse.json → Dates como ISO). No muta la firma de buildProjection.
 */
export async function buildPartialProjection(
  tenantId: string,
  range: ReturnRange,
): Promise<ProjectionMatrix> {
  return buildProjection(tenantId, {
    from: parseYmdUtc(range.from),
    to: parseYmdUtc(range.to),
    granularity: "weekly",
  });
}

/**
 * Tras mutación exitosa: intenta adjuntar `projection` a `data`.
 * Fallos del parcial NO rompen la mutación (log + data sin projection).
 */
export async function withPartialProjection<T extends object>(
  tenantId: string,
  returnRange: ReturnRange | undefined,
  data: T,
): Promise<T & { projection?: ProjectionMatrix }> {
  if (!returnRange) return data;
  try {
    const projection = await buildPartialProjection(tenantId, returnRange);
    return { ...data, projection };
  } catch (err) {
    console.error("[Finance/Cashflow] partial-projection:", err);
    return data;
  }
}
