/**
 * Tests del builder de props del PDF consolidado: pagos únicos de TODAS las
 * instalaciones (antes solo salían los de la primera), condiciones desde el
 * bundle y totales del cuadro consolidado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  bundleFindFirst: vi.fn(),
  buildProposalProps: vi.fn(),
  getUfValue: vi.fn(),
  loadDotacionPositions: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { cpqProposalBundle: { findFirst: mocks.bundleFindFirst } },
}));

vi.mock("../build-proposal-props", () => ({
  buildProposalProps: mocks.buildProposalProps,
}));

vi.mock("@/lib/uf", () => ({
  getUfValue: mocks.getUfValue,
  clpToUf: (clp: number, uf: number) => clp / uf,
}));

vi.mock("@/lib/cpq/proposal-sections/build-dotacion", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/cpq/proposal-sections/build-dotacion")
  >("@/lib/cpq/proposal-sections/build-dotacion");
  return {
    ...actual,
    loadDotacionPositions: mocks.loadDotacionPositions,
  };
});

import { buildBundleProposalProps } from "../build-bundle-proposal-props";

function quoteProps(over: Record<string, unknown> = {}) {
  return {
    fileName: "q.pdf",
    quotationCode: "CPQ-2026-001",
    installationName: "Sucursal Centro",
    installationCity: "Santiago",
    installationAddress: "Av. 1",
    staffingCount: 4,
    coverageSchedule: "24/7",
    items: [{ index: 1, description: "Guardias", quantity: 2, unitPrice: 100, subtotal: 100, unitPriceFormatted: "", subtotalFormatted: "" }],
    totalNeto: 1_000_000,
    totalNetoFormatted: "$1.000.000",
    currency: "CLP",
    ufValue: 40_000,
    paymentTerms: "Mensual, contra entrega de factura",
    companyName: "Cliente SpA",
    validUntil: "1 de enero de 2027",
    proposalSections: [
      {
        id: "dot",
        order: 0,
        title: "Dotación",
        content: "Solo Centro",
      },
      {
        id: "uni",
        order: 1,
        title: "Uniformes y EPP",
        content: "Uniforme institucional",
      },
    ],
    breakdown: {
      positions: [],
      totalLaborCost: 500_000,
      holidayAdjustment: 0,
      uniforms: 50_000,
      exams: 0,
      meals: 0,
      vehicles: 0,
      infrastructure: 0,
      equipment: 0,
      transport: 0,
      systems: 0,
      other: 0,
      subtotalBase: 550_000,
      marginPct: 13,
      marginAmount: 80_000,
      financial: 0,
      financialRatePct: 0,
      policy: 0,
      policyRatePct: 0,
      totalSalePrice: 1_000_000,
      additionalLines: 0,
      grandTotal: 1_000_000,
      monthlyHoursStandard: 180,
      currency: "CLP",
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUfValue.mockResolvedValue(40_000);
  mocks.bundleFindFirst.mockResolvedValue({
    id: "b1",
    code: "PROP-2026-001",
    currency: "CLP",
    validUntil: null,
    paymentTerms: null,
    quotes: [{ quoteId: "q1" }, { quoteId: "q2" }],
  });
  mocks.loadDotacionPositions.mockImplementation(async (quoteId: string) => {
    if (quoteId === "q1") {
      return [
        {
          customName: "Día Centro",
          weekdays: ["lun", "mar", "mie", "jue", "vie", "sab", "dom"],
          startTime: "08:00",
          endTime: "20:00",
          numGuards: 2,
          numPuestos: 1,
          cargo: { name: "Guardia" },
          serviceGroup: { name: "Acceso", displayOrder: 0 },
        },
      ];
    }
    return [
      {
        customName: "Día Norte",
        weekdays: ["lun", "mar", "mie", "jue", "vie", "sab", "dom"],
        startTime: "08:00",
        endTime: "20:00",
        numGuards: 3,
        numPuestos: 1,
        cargo: { name: "Guardia" },
        serviceGroup: { name: "Acceso", displayOrder: 0 },
      },
    ];
  });
});

describe("buildBundleProposalProps", () => {
  it("pasa pdfMode a cada cotización hija", async () => {
    mocks.buildProposalProps
      .mockResolvedValueOnce(quoteProps({ watermark: "BORRADOR" }))
      .mockResolvedValueOnce(
        quoteProps({
          quotationCode: "CPQ-2026-002",
          installationName: "Sucursal Norte",
          watermark: "BORRADOR",
        }),
      );

    const props = await buildBundleProposalProps("b1", "t1", { pdfMode: "final" });

    expect(mocks.buildProposalProps).toHaveBeenCalledWith("q1", "t1", {
      pdfMode: "final",
    });
    expect(mocks.buildProposalProps).toHaveBeenCalledWith("q2", "t1", {
      pdfMode: "final",
    });
    expect(props.watermark).toBeNull();
  });

  it("agrega los pagos únicos de TODAS las instalaciones, prefijados y renumerados", async () => {
    mocks.buildProposalProps
      .mockResolvedValueOnce(
        quoteProps({
          installationName: "Sucursal Centro",
          oneTimeItems: [
            { index: 1, description: "Instalación CCTV", quantity: 1, subtotal: 500_000, subtotalFormatted: "$500.000" },
          ],
          oneTimeTotalFormatted: "$500.000",
        }),
      )
      .mockResolvedValueOnce(
        quoteProps({
          quotationCode: "CPQ-2026-002",
          installationName: "Sucursal Norte",
          totalNeto: 2_000_000,
          oneTimeItems: [
            { index: 1, description: "Kit inicial", quantity: 2, subtotal: 300_000, subtotalFormatted: "$300.000" },
          ],
          oneTimeTotalFormatted: "$300.000",
        }),
      );

    const props = await buildBundleProposalProps("b1", "t1");

    expect(props.oneTimeItems).toHaveLength(2);
    expect(props.oneTimeItems!.map((i) => i.index)).toEqual([1, 2]);
    expect(props.oneTimeItems!.map((i) => i.description)).toEqual([
      "Sucursal Centro — Instalación CCTV",
      "Sucursal Norte — Kit inicial",
    ]);
    expect(props.consolidatedSummary!.totalOneTime).toBe(800_000);
    expect(props.installations![0]!.oneTimeItems).toHaveLength(1);
    expect(props.installations![1]!.oneTimeTotalFormatted).toBe("$300.000");
  });

  it("sin pagos únicos deja los campos undefined (no imprime bloque vacío)", async () => {
    mocks.buildProposalProps
      .mockResolvedValueOnce(quoteProps())
      .mockResolvedValueOnce(quoteProps({ quotationCode: "CPQ-2026-002" }));

    const props = await buildBundleProposalProps("b1", "t1");

    expect(props.oneTimeItems).toBeUndefined();
    expect(props.oneTimeTotalFormatted).toBeUndefined();
    expect(props.consolidatedSummary!.totalOneTime).toBeUndefined();
  });

  it("las condiciones del bundle mandan sobre las de la cotización de referencia", async () => {
    mocks.bundleFindFirst.mockResolvedValue({
      id: "b1",
      code: "PROP-2026-001",
      currency: "CLP",
      validUntil: new Date("2027-03-31T00:00:00Z"),
      paymentTerms: "30_dias",
      quotes: [{ quoteId: "q1" }],
    });
    mocks.buildProposalProps.mockResolvedValueOnce(quoteProps());

    const props = await buildBundleProposalProps("b1", "t1");

    expect(props.paymentTerms).toBe("30 días");
    expect(props.validUntil).toContain("2027");
    expect(props.quotationCode).toBe("PROP-2026-001");
  });

  it("consolida el total mensual y la dotación de las incluidas", async () => {
    mocks.buildProposalProps
      .mockResolvedValueOnce(quoteProps({ totalNeto: 1_000_000, staffingCount: 4 }))
      .mockResolvedValueOnce(
        quoteProps({ quotationCode: "CPQ-2026-002", totalNeto: 2_500_000, staffingCount: 6 }),
      );

    const props = await buildBundleProposalProps("b1", "t1");

    expect(props.consolidatedSummary!.totalMonthly).toBe(3_500_000);
    expect(props.consolidatedSummary!.totalGuards).toBe(10);
    expect(props.consolidatedSummary!.installationCount).toBe(2);
    expect(props.totalNeto).toBe(3_500_000);
  });

  it("reescribe Dotación con todas las instalaciones y suma breakdown", async () => {
    mocks.buildProposalProps
      .mockResolvedValueOnce(quoteProps({ installationName: "Sucursal Centro" }))
      .mockResolvedValueOnce(
        quoteProps({
          quotationCode: "CPQ-2026-002",
          installationName: "Sucursal Norte",
          totalNeto: 2_000_000,
          breakdown: {
            ...quoteProps().breakdown,
            totalLaborCost: 800_000,
            uniforms: 40_000,
            grandTotal: 2_000_000,
            totalSalePrice: 2_000_000,
            subtotalBase: 840_000,
            marginAmount: 160_000,
          },
        }),
      );

    const props = await buildBundleProposalProps("b1", "t1");
    const dotacion = props.proposalSections!.find((s) => s.title === "Dotación")!.content;
    expect(dotacion).toContain("Sucursal Centro");
    expect(dotacion).toContain("Sucursal Norte");
    expect(dotacion).not.toBe("Solo Centro");
    expect(props.breakdown!.totalLaborCost).toBe(1_300_000);
    expect(props.breakdown!.uniforms).toBe(90_000);
  });

  it("propuesta sin cotizaciones incluidas → BUNDLE_EMPTY", async () => {
    mocks.bundleFindFirst.mockResolvedValue({
      id: "b1",
      code: "PROP-2026-001",
      currency: "CLP",
      validUntil: null,
      paymentTerms: null,
      quotes: [],
    });
    await expect(buildBundleProposalProps("b1", "t1")).rejects.toThrow("BUNDLE_EMPTY");
  });
});
