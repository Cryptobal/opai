import { describe, it, expect } from "vitest";
import { eachDayOfInterval } from "date-fns";
import {
  bucketBoundsFor,
  bucketKeyFor,
} from "../recurrence-engine";
import type { ProjectionRange } from "../types";

/**
 * Regresión del descuadre de bordes (Bug A).
 *
 * `buildProjection` es monolítica y respaldada por Prisma (no invocable sin DB
 * real). Siguiendo el estilo de `projection-drift` / `projection-voided-dte`,
 * replicamos EXACTAMENTE el slice afectado por el fix:
 *
 *   1. la alineación de rango (projection.service.ts ~L450): ambos extremos se
 *      llevan a los bordes del bucket con `bucketBoundsFor` (funciones REALES
 *      importadas de recurrence-engine);
 *   2. `buildBuckets` (~L2209): una columna por bucket ISO completo sobre
 *      [from, to];
 *   3. el filtro SQL de las occurrences (`gte: from, lte: to`) que alimenta
 *      `bucket.income`.
 *
 * `alignBoth=false` reproduce el estado PRE-fix (sólo `from` se alineaba);
 * `true` es el código actual. MANTENER SINCRONIZADO con buildProjection.
 */

/** Mirror de la alineación de rango de buildProjection. */
function alignRange(
  range: ProjectionRange,
  { alignBoth = true }: { alignBoth?: boolean } = {},
): ProjectionRange {
  const from = bucketBoundsFor(range.from, range.granularity).start;
  const to = alignBoth
    ? bucketBoundsFor(range.to, range.granularity).end
    : range.to;
  return { ...range, from, to };
}

/**
 * Mirror de buildBuckets + filtro SQL: income de cada bucket = suma de las
 * facturas cuya fecha cae dentro del bucket ISO completo Y dentro del filtro
 * `[range.from, range.to]`. Devuelve el income por bucketKey.
 */
function incomeByBucket(
  range: ProjectionRange,
  invoices: { date: Date; amount: number }[],
): Map<string, number> {
  const income = new Map<string, number>();
  // buildBuckets: una columna por bucket ISO completo sobre [from, to].
  for (const day of eachDayOfInterval({ start: range.from, end: range.to })) {
    income.set(bucketKeyFor(day, range.granularity), 0);
  }
  // Filtro SQL (`gte: from, lte: to`) + acumulación por bucketKey.
  for (const inv of invoices) {
    if (inv.date < range.from || inv.date > range.to) continue;
    const key = bucketKeyFor(inv.date, range.granularity);
    if (!income.has(key)) continue; // fuera de los buckets construidos
    income.set(key, income.get(key)! + inv.amount);
  }
  return income;
}

describe("buildProjection — alineación de rango a bordes de bucket", () => {
  it("Caso 1: `from` a mitad de semana se alinea al lunes ISO", () => {
    const range = alignRange({
      from: new Date("2026-07-08"), // miércoles
      to: new Date("2026-07-26"),
      granularity: "weekly",
    });
    expect(range.from.getDay()).toBe(1); // lunes
    expect(range.from.getDate()).toBe(6); // 2026-07-06
    expect(range.from.getHours()).toBe(0);
    expect(range.from.getMinutes()).toBe(0);
  });

  it("Caso 2: `to` a mitad de semana se alinea al domingo ISO (23:59:59.999)", () => {
    const range = alignRange({
      from: new Date("2026-07-06"),
      to: new Date("2026-07-08"), // miércoles
      granularity: "weekly",
    });
    expect(range.to.getDay()).toBe(0); // domingo
    expect(range.to.getDate()).toBe(12); // 2026-07-12
    expect(range.to.getHours()).toBe(23);
    expect(range.to.getMinutes()).toBe(59);
    expect(range.to.getSeconds()).toBe(59);
    expect(range.to.getMilliseconds()).toBe(999);
  });

  it("Caso 3 (el bug): la misma semana rinde el MISMO income como último bucket que como bucket interior", () => {
    // Factura del jueves 2026-07-09, dentro de la semana W (lun 06 – dom 12).
    const invoices = [{ date: new Date("2026-07-09"), amount: 1_000_000 }];
    // W como ÚLTIMO bucket: `to` cae el miércoles 08, a mitad de W.
    const asLast: ProjectionRange = {
      from: new Date("2026-06-22"),
      to: new Date("2026-07-08"),
      granularity: "weekly",
    };
    // W como bucket INTERIOR: `to` mucho más adelante.
    const asInterior: ProjectionRange = {
      from: new Date("2026-06-22"),
      to: new Date("2026-07-26"),
      granularity: "weekly",
    };
    const wKey = bucketKeyFor(new Date("2026-07-09"), "weekly");

    // PRE-fix (sólo `from` alineado): la semana del borde queda truncada.
    const oldLast = incomeByBucket(alignRange(asLast, { alignBoth: false }), invoices);
    const oldInterior = incomeByBucket(
      alignRange(asInterior, { alignBoth: false }),
      invoices,
    );
    expect(oldLast.get(wKey)).toBe(0); // ❌ factura del jueves excluida
    expect(oldInterior.get(wKey)).toBe(1_000_000);
    expect(oldLast.get(wKey)).not.toBe(oldInterior.get(wKey)); // descuadre

    // POST-fix (ambos extremos alineados): idéntico en las dos posiciones.
    const newLast = incomeByBucket(alignRange(asLast), invoices);
    const newInterior = incomeByBucket(alignRange(asInterior), invoices);
    expect(newLast.get(wKey)).toBe(1_000_000);
    expect(newLast.get(wKey)).toBe(newInterior.get(wKey)); // ✅ cuadra
  });

  it("Caso 4: granularity monthly alinea `to` a fin de mes", () => {
    const range = alignRange({
      from: new Date("2026-07-08"),
      to: new Date("2026-07-08"), // mitad de julio
      granularity: "monthly",
    });
    expect(range.from.getDate()).toBe(1); // 1 de julio
    expect(range.to.getMonth()).toBe(6); // julio (0-indexed)
    expect(range.to.getDate()).toBe(31); // fin de julio
    expect(range.to.getHours()).toBe(23);
  });
});
