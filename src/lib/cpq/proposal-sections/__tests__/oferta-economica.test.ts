import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EconomicOpeningTable } from "@/components/cpq/proposal/EconomicOpeningTable";
import {
  economicOpeningFromBreakdown,
  economicOpeningFromCostSummary,
  economicOpeningFromQuote,
  formatOpeningPct,
} from "@/lib/cpq/economic-opening";
import { detectHeadingsFromCorpus } from "../propose-index";

describe("economicOpeningFromBreakdown", () => {
  it("arma la apertura con ceros si no hay costeo", () => {
    const opening = economicOpeningFromBreakdown(null);
    expect(opening.rows).toHaveLength(5);
    expect(opening.rows.every((r) => r.amountClp === 0)).toBe(true);
    expect(opening.serviceLines).toEqual([]);
    expect(opening.byInstallation).toEqual([]);
    expect(opening.salariesByRole).toEqual([]);
    expect(opening.note).toMatch(/IVA/);
  });

  it("usa el margen configurado y el total de venta", () => {
    const opening = economicOpeningFromBreakdown({
      positions: [],
      totalLaborCost: 400,
      holidayAdjustment: 10,
      uniforms: 20,
      exams: 5,
      meals: 15,
      vehicles: 30,
      infrastructure: 10,
      equipment: 40,
      transport: 5,
      systems: 5,
      other: 10,
      subtotalBase: 550,
      marginPct: 12,
      marginAmount: 80,
      financial: 0,
      financialRatePct: 0,
      policy: 0,
      policyRatePct: 0,
      totalSalePrice: 630,
      additionalLines: 0,
      grandTotal: 630,
      monthlyHoursStandard: 180,
      currency: "UF",
      ufValue: 39000,
    });
    expect(opening.rows.find((r) => r.key === "labor")?.amountClp).toBe(400);
    expect(opening.rows.find((r) => r.key === "direct")?.amountClp).toBe(50);
    expect(opening.rows.find((r) => r.key === "indirect")?.amountClp).toBe(100);
    expect(opening.rows.find((r) => r.key === "margin")?.pct).toBe(12);
    expect(opening.rows.find((r) => r.key === "sale")?.amountClp).toBe(630);
    expect(formatOpeningPct(12)).toMatch(/12[,.]0%/);
  });

  it("deriva servicios y sueldos por cargo desde las posiciones del costeo", () => {
    const opening = economicOpeningFromBreakdown({
      positions: [
        {
          id: "p1",
          name: "Guardia día",
          cargoName: "Guardia de seguridad",
          numGuards: 2,
          numPuestos: 1,
          totalGuardsInPosition: 2,
          baseSalary: 1_200_000,
          gratification: 300_000,
          totalImponible: 1_500_000,
          sisEmployer: 0,
          pensionReformEmployer: 52_500,
          afcEmployer: 36_000,
          mutualEmployer: 18_000,
          mealAllowance: 80_000,
          transportAllowance: 60_000,
          vacationProvision: 0,
          severanceProvision: 0,
          totalLaborCost: 1_846_500,
          salePrice: 2_000_000,
          hourlyRateSale: 0,
        },
      ],
      totalLaborCost: 1_846_500,
      holidayAdjustment: 0,
      uniforms: 0,
      exams: 0,
      meals: 0,
      vehicles: 0,
      infrastructure: 0,
      equipment: 0,
      transport: 0,
      systems: 0,
      other: 0,
      subtotalBase: 1_846_500,
      marginPct: 10,
      marginAmount: 153_500,
      financial: 0,
      financialRatePct: 0,
      policy: 0,
      policyRatePct: 0,
      totalSalePrice: 2_000_000,
      additionalLines: 0,
      grandTotal: 2_000_000,
      monthlyHoursStandard: 180,
      currency: "CLP",
    });

    expect(opening.serviceLines).toEqual([
      {
        description: "Guardia día",
        quantity: 2,
        unitPriceClp: 1_000_000,
        subtotalClp: 2_000_000,
      },
    ]);
    expect(opening.salariesByRole).toEqual([
      {
        cargo: "Guardia de seguridad",
        count: 2,
        baseClp: 600_000,
        gratificacionClp: 150_000,
        colacionMovilizacionClp: 70_000,
        leyesSocialesClp: 53_250,
        costoEmpresaClp: 923_250,
      },
    ]);
  });

  it("acepta líneas e instalaciones de las props de la cotización", () => {
    const opening = economicOpeningFromQuote({
      breakdown: null,
      serviceLines: [
        {
          description: "Servicio de vigilancia",
          quantity: 4,
          unitPriceClp: 500_000,
          subtotalClp: 2_000_000,
        },
      ],
      installations: [
        { name: "Planta Norte", guards: 4, amountClp: 2_000_000 },
      ],
    });

    expect(opening.serviceLines?.[0]?.description).toBe("Servicio de vigilancia");
    expect(opening.byInstallation).toEqual([
      { name: "Planta Norte", guards: 4, amountClp: 2_000_000 },
    ]);
  });
});

describe("economicOpeningFromCostSummary", () => {
  it("conserva detalles disponibles y entrega arreglos vacíos cuando faltan", () => {
    const empty = economicOpeningFromCostSummary(undefined);
    expect(empty.serviceLines).toEqual([]);
    expect(empty.byInstallation).toEqual([]);
    expect(empty.salariesByRole).toEqual([]);

    const opening = economicOpeningFromCostSummary(
      { monthlyPositions: 800_000, salePriceMonthly: 1_000_000 },
      {
        serviceLines: [
          {
            description: "Supervisor",
            quantity: 1,
            unitPriceClp: 1_000_000,
            subtotalClp: 1_000_000,
          },
        ],
        byInstallation: [
          { name: "Casa matriz", guards: 1, amountClp: 1_000_000 },
        ],
      },
    );
    expect(opening.serviceLines).toHaveLength(1);
    expect(opening.byInstallation).toHaveLength(1);
  });
});

describe("EconomicOpeningTable", () => {
  it("muestra los cuatro bloques de la apertura completa", () => {
    const opening = economicOpeningFromCostSummary(
      { monthlyPositions: 800_000, salePriceMonthly: 1_000_000 },
      {
        serviceLines: [
          {
            description: "Vigilancia 24/7",
            quantity: 2,
            unitPriceClp: 500_000,
            subtotalClp: 1_000_000,
          },
        ],
        byInstallation: [
          { name: "Planta Norte", guards: 2, amountClp: 1_000_000 },
        ],
        salariesByRole: [
          {
            cargo: "Guardia de seguridad",
            count: 2,
            baseClp: 600_000,
            gratificacionClp: 150_000,
            colacionMovilizacionClp: 70_000,
            leyesSocialesClp: 53_250,
            costoEmpresaClp: 923_250,
          },
        ],
      },
    );

    render(createElement(EconomicOpeningTable, { opening }));

    expect(screen.getByText("Cotización por servicios")).toBeInTheDocument();
    expect(screen.getByText("Apertura por instalación")).toBeInTheDocument();
    expect(screen.getByText("Sueldos por cargo")).toBeInTheDocument();
    expect(screen.getByText("Estructura del precio")).toBeInTheDocument();
    expect(screen.getByText("Planta Norte")).toBeInTheDocument();
    expect(screen.getByText("Guardia de seguridad")).toBeInTheDocument();
  });
});

describe("índice de licitación incluye oferta económica", () => {
  it("detectHeadingsFromCorpus inserta la auto antes de la matriz", () => {
    const items = detectHeadingsFromCorpus({
      dealId: "d1",
      chunks: [],
      truncated: false,
      hasBases: true,
      basesError: null,
      banner: "",
    });
    const ofertaIdx = items.findIndex((i) => i.kind === "oferta_economica");
    const matrizIdx = items.findIndex((i) => i.invariant === "matriz");
    expect(ofertaIdx).toBeGreaterThan(-1);
    expect(ofertaIdx).toBeLessThan(matrizIdx);
  });
});
