import { describe, expect, it } from "vitest";
import type { ProjectedPnlInstallationRow } from "../projected-pnl";
import {
  contributionsForLine,
  PNL_LINE_META,
  RANKING_COLUMN_SPECS,
} from "../projected-pnl-view";

function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0);
}

function row(partial: {
  id: string;
  name: string;
  personnel?: number;
  extraShifts?: number;
  directCost?: number;
  revenue?: number;
  gav?: number;
}): ProjectedPnlInstallationRow {
  const revenue = partial.revenue ?? 0;
  const personnel = partial.personnel ?? 0;
  const extraShifts = partial.extraShifts ?? 0;
  const directCost = partial.directCost ?? 0;
  const gav = partial.gav ?? 0;
  const result = revenue - personnel - extraShifts - directCost - gav;
  return {
    installationId: partial.id,
    name: partial.name,
    totals: {
      revenue,
      personnel,
      extraShifts,
      directCost,
      gav,
      result,
      marginPct: revenue ? Number(((result / revenue) * 100).toFixed(1)) : 0,
    },
    monthly: {
      revenue: [revenue],
      personnel: [personnel],
      extraShifts: [extraShifts],
      directCost: [directCost],
      gav: [gav],
      result: [result],
    },
  };
}

describe("PNL_LINE_META", () => {
  it("nombra compras de faena, no costos directos", () => {
    const labels = PNL_LINE_META.map((l) => l.label);
    expect(labels).toContain("Compras de faena");
    expect(labels).not.toContain("Costos directos");
    expect(labels).not.toContain("Costo directo");
    expect(PNL_LINE_META.find((l) => l.id === "directCost")?.label).toBe(
      "Compras de faena",
    );
  });
});

describe("RANKING_COLUMN_SPECS", () => {
  it("no mezcla personal, TE y compras bajo Costo directo", () => {
    const headers = RANKING_COLUMN_SPECS.map((c) => c.header);
    expect(headers).not.toContain("Costo directo");
    expect(headers).not.toContain("Costos directos");
    expect(headers).toEqual([
      "Instalación",
      "Ingresos",
      "Personal",
      "TE",
      "Compras de faena",
      "GAV",
      "Resultado",
      "%",
    ]);

    const sample = row({
      id: "a",
      name: "Anglo",
      revenue: 268_600_000,
      personnel: 132_000_000,
      extraShifts: 300_000,
      directCost: 0,
      gav: 5_000_000,
    });

    const byId = Object.fromEntries(
      RANKING_COLUMN_SPECS.map((c) => [c.id, c.valueOf(sample)]),
    );
    expect(byId.personnel).toBe(132_000_000);
    expect(byId.extraShifts).toBe(300_000);
    expect(byId.directCost).toBe(0);
    expect(byId.personnel).not.toBe(
      sample.totals.personnel + sample.totals.extraShifts + sample.totals.directCost,
    );
  });
});

describe("contributionsForLine", () => {
  it("omite ceros y ordena por magnitud", () => {
    const a = row({ id: "a", name: "A", personnel: 10, revenue: 1 });
    const b = row({ id: "b", name: "B", personnel: 40, revenue: 1 });
    const c = row({
      id: "c",
      name: "C",
      personnel: 0,
      revenue: 1,
    });
    c.monthly.personnel = zeros(1);

    const out = contributionsForLine([a, b, c], "personnel");
    expect(out.map((x) => x.installationId)).toEqual(["b", "a"]);
    expect(out[0]?.total).toBe(40);
  });
});
