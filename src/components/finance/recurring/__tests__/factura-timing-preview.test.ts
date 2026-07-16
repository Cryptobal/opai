/**
 * El preview del form debe contar la MISMA historia que
 * `calcularFechaEmisionProyectada` en el backend: primero el mes destino,
 * después el clamp del día contra ese mes.
 */
import { describe, it, expect } from "vitest";
import {
  buildFacturaTimingPreview,
  type FacturaTimingValue,
} from "../factura-timing-preview";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

const value = (over: Partial<FacturaTimingValue> = {}): FacturaTimingValue => ({
  facturaTiming: "DIA_ESPECIFICO",
  facturaDay: "1",
  facturaMesRelativo: "MES_SIGUIENTE",
  ...over,
});

// Julio 2026: programación el 20.
const JULIO = new Date(2026, 6, 15);

describe("buildFacturaTimingPreview", () => {
  it("AL_EMITIR: la factura sale el mismo día de la programación", () => {
    const rows = buildFacturaTimingPreview(value({ facturaTiming: "AL_EMITIR" }), 20, JULIO);
    expect(rows.map((r) => ymd(r.prog))).toEqual([
      "2026-07-20",
      "2026-08-20",
      "2026-09-20",
    ]);
    expect(rows.map((r) => ymd(r.factura))).toEqual(rows.map((r) => ymd(r.prog)));
  });

  it("DIA_ESPECIFICO día 1 + MES_SIGUIENTE: 20-jul → 1-ago, 20-ago → 1-sep…", () => {
    const rows = buildFacturaTimingPreview(value(), 20, JULIO);
    expect(rows.map((r) => ymd(r.factura))).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
  });

  it("facturaDay=-1: último día del mes destino", () => {
    const rows = buildFacturaTimingPreview(value({ facturaDay: "-1" }), 20, JULIO);
    expect(rows.map((r) => ymd(r.factura))).toEqual([
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
    ]);
  });

  it("facturaDay=31 cayendo en un mes corto: clamp al último día real", () => {
    // Servicio enero 2026 → factura febrero (28, no bisiesto).
    const rows = buildFacturaTimingPreview(
      value({ facturaDay: "31" }),
      20,
      new Date(2026, 0, 10),
    );
    expect(ymd(rows[0].factura)).toBe("2026-02-28");
  });

  it("MISMO_MES: factura en el propio mes de la programación", () => {
    const rows = buildFacturaTimingPreview(
      value({ facturaDay: "5", facturaMesRelativo: "MISMO_MES" }),
      20,
      JULIO,
    );
    expect(ymd(rows[0].factura)).toBe("2026-07-05");
  });

  it("día inválido (input a medio escribir): cae al día de la programación, sin romper", () => {
    const rows = buildFacturaTimingPreview(value({ facturaDay: "" }), 20, JULIO);
    expect(ymd(rows[0].factura)).toBe("2026-07-20");
  });
});
