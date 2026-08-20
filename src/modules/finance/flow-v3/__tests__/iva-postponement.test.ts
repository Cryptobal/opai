import { describe, expect, it } from "vitest";
import {
  computeOriginalPayYmd,
  computePostponedPayYmd,
  lookbackFromYmd,
  splitF29Milestone,
} from "../iva-postponement";

const POSTPONEMENT = {
  taxPeriod: "2026-08",
  postponedPayYmd: "2026-11-20",
};

describe("computeOriginalPayYmd / computePostponedPayYmd", () => {
  it("período 2026-08 → pago 12-09 → postergado 20-11", () => {
    const pay = computeOriginalPayYmd("2026-08", 12);
    expect(pay).toBe("2026-09-12");
    expect(computePostponedPayYmd(pay, 20)).toBe("2026-11-20");
  });

  it("cruza el año: 2026-11 → pago 2026-12 → postergado 2027-02", () => {
    const pay = computeOriginalPayYmd("2026-11", 12);
    expect(pay).toBe("2026-12-12");
    expect(computePostponedPayYmd(pay, 20)).toBe("2027-02-20");
  });

  it("clampa el día 31 al último del mes destino (feb)", () => {
    expect(computePostponedPayYmd("2026-12-31", 31)).toBe("2027-02-28");
  });

  it("clampa el día 31 → 30 en meses de 30 días", () => {
    expect(computePostponedPayYmd("2026-02-28", 31)).toBe("2026-04-30");
  });
});

describe("lookbackFromYmd", () => {
  it("retrocede 3 meses para no perder el hito postergado", () => {
    expect(lookbackFromYmd("2026-11-02", 3)).toBe("2026-08-02");
  });
});

describe("splitF29Milestone", () => {
  it("sin postergación emite el hito f29 intacto (regresión)", () => {
    const out = splitF29Milestone({
      taxPeriod: "2026-08",
      payYmd: "2026-09-12",
      totalAPagarClp: 2_500_000,
      ivaDeterminadoClp: 2_200_000,
      postponement: null,
    });
    expect(out).toEqual([
      {
        key: "f29",
        label: "IVA F29 2026-08",
        dateYmd: "2026-09-12",
        amountClp: 2_500_000,
        taxPeriod: "2026-08",
        metaNote: undefined,
      },
    ]);
  });

  it("conserva el suffix de proyección", () => {
    const out = splitF29Milestone({
      taxPeriod: "2026-08",
      payYmd: "2026-09-12",
      totalAPagarClp: 1_000_000,
      ivaDeterminadoClp: 800_000,
      postponement: null,
      labelSuffix: "(proy.)",
    });
    expect(out[0]!.label).toBe("IVA F29 2026-08 (proy.)");
  });

  it("parte resto + IVA y cumple invariante de suma", () => {
    const total = 2_500_000;
    const iva = 2_200_000;
    const out = splitF29Milestone({
      taxPeriod: "2026-08",
      payYmd: "2026-09-12",
      totalAPagarClp: total,
      ivaDeterminadoClp: iva,
      postponement: POSTPONEMENT,
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      key: "f29",
      amountClp: 300_000,
      dateYmd: "2026-09-12",
      taxPeriod: "2026-08",
    });
    expect(out[0]!.label).toContain("solo PPM");
    expect(out[1]).toMatchObject({
      key: "iva_postergado",
      amountClp: 2_200_000,
      dateYmd: "2026-11-20",
      taxPeriod: "2026-08",
    });
    expect(out[1]!.label).toContain("vence 20-11-2026");
    expect(out.reduce((s, m) => s + m.amountClp, 0)).toBe(total);
  });

  it("IVA a favor: ivaPostergado = 0 y resto = totalAPagar", () => {
    const out = splitF29Milestone({
      taxPeriod: "2026-08",
      payYmd: "2026-09-12",
      totalAPagarClp: 150_000,
      ivaDeterminadoClp: -400_000,
      postponement: POSTPONEMENT,
    });
    expect(out).toEqual([
      expect.objectContaining({
        key: "f29",
        amountClp: 150_000,
        dateYmd: "2026-09-12",
      }),
    ]);
    expect(out.reduce((s, m) => s + m.amountClp, 0)).toBe(150_000);
  });

  it("resto = 0 omite el hito f29 y deja solo el postergado", () => {
    const out = splitF29Milestone({
      taxPeriod: "2026-08",
      payYmd: "2026-09-12",
      totalAPagarClp: 1_800_000,
      ivaDeterminadoClp: 1_800_000,
      postponement: POSTPONEMENT,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.key).toBe("iva_postergado");
    expect(out[0]!.amountClp).toBe(1_800_000);
  });

  it("redondea a enteros CLP y nunca deja decimales", () => {
    const out = splitF29Milestone({
      taxPeriod: "2026-08",
      payYmd: "2026-09-12",
      totalAPagarClp: 1000.6,
      ivaDeterminadoClp: 400.4,
      postponement: POSTPONEMENT,
    });
    expect(out.every((m) => Number.isInteger(m.amountClp))).toBe(true);
    expect(out.reduce((s, m) => s + m.amountClp, 0)).toBe(1001);
  });
});
