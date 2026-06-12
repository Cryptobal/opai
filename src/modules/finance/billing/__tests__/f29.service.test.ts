import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { findMany: vi.fn() },
    fxUtmRate: { findMany: vi.fn() },
    financeCashflowConfig: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { computeF29Period } from "../f29.service";

const TENANT = "tenant-1";
const PERIODO = "2026-05";

const dec = (n: number) => ({ toNumber: () => n });

let folioSeq = 1;

function doc(over: {
  direction: "ISSUED" | "RECEIVED";
  dteType: number;
  periodo?: string;
  net?: number;
  exempt?: number;
  tax?: number;
  total?: number;
  siiStatus?: string;
  receptionStatus?: string | null;
}) {
  const [y, m] = (over.periodo ?? PERIODO).split("-").map(Number);
  return {
    id: `dte-${folioSeq}`,
    direction: over.direction,
    dteType: over.dteType,
    folio: folioSeq++,
    date: new Date(Date.UTC(y, m - 1, 10)),
    issuerRut: "11-1",
    issuerName: "Proveedor X",
    receiverRut: "22-2",
    receiverName: "Cliente Y",
    netAmount: dec(over.net ?? 0),
    exemptAmount: dec(over.exempt ?? 0),
    taxAmount: dec(over.tax ?? 0),
    totalAmount: dec(over.total ?? (over.net ?? 0) + (over.exempt ?? 0) + (over.tax ?? 0)),
    siiStatus: over.siiStatus ?? "ACCEPTED",
    receptionStatus: over.receptionStatus ?? null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  folioSeq = 1;
  (prisma.fxUtmRate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
});

describe("computeF29Period — reglas del libro", () => {
  it("resta NC recibidas del crédito fiscal (no las suma)", async () => {
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ direction: "ISSUED", dteType: 33, net: 10_000_000, tax: 1_900_000 }),
      doc({ direction: "RECEIVED", dteType: 33, net: 1_000_000, tax: 190_000 }),
      doc({ direction: "RECEIVED", dteType: 61, net: 200_000, tax: 38_000 }),
    ]);

    const r = await computeF29Period(TENANT, PERIODO);
    expect(r.f29.debitoFiscal).toBe(1_900_000);
    expect(r.f29.creditoFiscal).toBe(190_000 - 38_000);
    expect(r.f29.ivaDeterminado).toBe(1_900_000 - 152_000);
  });

  it("excluye guías de despacho (52) y documentos reclamados del crédito", async () => {
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ direction: "ISSUED", dteType: 33, tax: 1_000_000 }),
      doc({ direction: "RECEIVED", dteType: 33, tax: 100_000 }),
      doc({ direction: "RECEIVED", dteType: 52, tax: 30_000 }),
      doc({
        direction: "RECEIVED",
        dteType: 33,
        tax: 50_000,
        receptionStatus: "CLAIMED",
      }),
    ]);

    const r = await computeF29Period(TENANT, PERIODO);
    expect(r.f29.creditoFiscal).toBe(100_000);
    expect(r.compras.count).toBe(1);
    // El doc reclamado y la guía no aparecen en el detalle del libro.
    expect(r.documentos.filter((d) => d.direction === "RECEIVED")).toHaveLength(1);
  });

  it("resta NC emitidas del débito y suma ND emitidas", async () => {
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ direction: "ISSUED", dteType: 33, tax: 2_000_000 }),
      doc({ direction: "ISSUED", dteType: 61, tax: 300_000 }),
      doc({ direction: "ISSUED", dteType: 56, tax: 100_000 }),
    ]);

    const r = await computeF29Period(TENANT, PERIODO);
    expect(r.f29.debitoFiscal).toBe(2_000_000 + 100_000 - 300_000);
  });

  it("calcula PPM sobre ingresos brutos (neto + exento − NC) con la tasa configurada", async () => {
    (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ppmRatePct: { toString: () => "1", valueOf: () => 1 },
    });
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ direction: "ISSUED", dteType: 33, net: 10_000_000, tax: 1_900_000 }),
      doc({ direction: "ISSUED", dteType: 34, net: 2_000_000 }),
      doc({ direction: "ISSUED", dteType: 61, net: 1_000_000, tax: 190_000 }),
    ]);

    const r = await computeF29Period(TENANT, PERIODO);
    // Base = 10M + 2M − 1M = 11M; PPM 1% = 110.000.
    expect(r.f29.ppmBase).toBe(11_000_000);
    expect(r.f29.ppmMonto).toBe(110_000);
    expect(r.f29.totalAPagar).toBe(r.f29.ivaDeterminado + 110_000);
  });

  it("arrastra remanente de crédito fiscal del mes anterior con reajuste UTM", async () => {
    // Abril: crédito 1.000.000 > débito 0 → remanente 1.000.000.
    // UTM abril 50.000 → 20 UTM → mayo UTM 51.000 → 1.020.000.
    // Mayo: débito 2.000.000 − crédito 0 − remanente 1.020.000 = 980.000.
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ direction: "RECEIVED", dteType: 33, periodo: "2026-04", tax: 1_000_000 }),
      doc({ direction: "ISSUED", dteType: 33, periodo: "2026-05", tax: 2_000_000 }),
    ]);
    (prisma.fxUtmRate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { month: new Date(Date.UTC(2026, 3, 1)), value: 50_000 },
      { month: new Date(Date.UTC(2026, 4, 1)), value: 51_000 },
    ]);

    const r = await computeF29Period(TENANT, PERIODO);
    expect(r.f29.remanenteAnterior).toBe(1_020_000);
    expect(r.f29.ivaDeterminado).toBe(980_000);
    expect(r.f29.totalAPagar).toBe(980_000);
  });

  it("reporta saldo a favor como remanente siguiente y total a pagar solo PPM", async () => {
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      doc({ direction: "ISSUED", dteType: 33, net: 1_000_000, tax: 190_000 }),
      doc({ direction: "RECEIVED", dteType: 33, tax: 500_000 }),
    ]);

    const r = await computeF29Period(TENANT, PERIODO);
    expect(r.f29.esIvaAFavor).toBe(true);
    expect(r.f29.remanenteSiguiente).toBe(310_000);
    expect(r.f29.totalAPagar).toBe(0);
  });
});
