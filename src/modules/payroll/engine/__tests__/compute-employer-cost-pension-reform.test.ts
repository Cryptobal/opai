/**
 * Tests del aporte empleador Ley 21.735 (pension_reform) en computeEmployerCost.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAugust2026Parameters,
  buildJuly2026Parameters,
} from "../../../../../prisma/seeds/payroll-params-chile-2026";
import type { PayrollParameters } from "../types";

vi.mock("../parameter-loader", () => ({
  loadActiveParameters: vi.fn(),
  loadParametersById: vi.fn(),
  resolveFxReferences: vi.fn(async (_uf?: number, _ufDate?: string, _utm?: number, _utmMonth?: string, imm?: number) => ({
    uf_clp: 40000,
    uf_date: "2026-08-01",
    utm_clp: 70000,
    utm_month: "2026-08",
    imm_clp: imm ?? 553553,
  })),
  createParametersSnapshot: vi.fn(
    (
      versionId: string,
      name: string,
      effectiveFrom: Date,
      effectiveUntil: Date | null,
      params: PayrollParameters,
      references: { uf_clp: number; uf_date: string; utm_clp: number; utm_month: string; imm_clp: number }
    ) => ({
      version_id: versionId,
      effective_from: effectiveFrom.toISOString(),
      effective_until: effectiveUntil?.toISOString() ?? null,
      name,
      references_at_calculation: {
        ...references,
        captured_at: new Date().toISOString(),
      },
      caps_clp: {
        pension: params.caps.pension_uf * references.uf_clp,
        health: params.caps.health_uf * references.uf_clp,
        work_injury: params.caps.work_injury_uf * references.uf_clp,
        afc: params.caps.afc_uf * references.uf_clp,
      },
      full_data: params,
    })
  ),
}));

import { computeEmployerCost } from "../compute-employer-cost";
import { loadParametersById } from "../parameter-loader";

const mockedLoadById = vi.mocked(loadParametersById);

function legacyFebParamsWithoutReform(): PayrollParameters {
  const july = buildJuly2026Parameters() as unknown as PayrollParameters;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pension_reform: _omit, ...rest } = july as PayrollParameters & {
    pension_reform?: unknown;
  };
  return {
    ...rest,
    version_metadata: {
      name: "Parámetros Legales Chile - Febrero 2026",
      effective_from: "2026-02-01",
      effective_until: "2026-02-28",
      source: "legacy",
    },
    sis: {
      ...rest.sis,
      employer_rate: 0.0154,
    },
    caps: {
      pension_uf: 89.9,
      health_uf: 89.9,
      work_injury_uf: 89.9,
      afc_uf: 135.1,
    },
    imm: {
      ...rest.imm,
      value_clp: 539000,
      effective_from: "2026-01-01",
    },
  };
}

function stubVersion(id: string, data: PayrollParameters, from: string, until: string | null) {
  mockedLoadById.mockResolvedValue({
    id,
    data,
    effectiveFrom: new Date(from),
    effectiveUntil: until ? new Date(until) : null,
  });
}

describe("computeEmployerCost — pension_reform (Ley 21.735)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseInput = {
    base_salary_clp: 600_000,
    contract_type: "indefinite" as const,
    afp_name: "modelo",
    health_system: "fonasa" as const,
    work_injury_risk: "security_industry" as const,
    assumptions: {
      include_vacation_provision: false,
      include_severance_provision: false,
    },
    uf_value: 40_000,
  };

  it("Julio 2026: SIS 2,0% + reforma 1,0% sobre imponible pensión", async () => {
    stubVersion(
      "ver-july",
      buildJuly2026Parameters() as unknown as PayrollParameters,
      "2026-07-01",
      "2026-07-31"
    );

    const result = await computeEmployerCost({
      ...baseInput,
      params_version_id: "ver-july",
    });

    // Base 600k → gratificación 25% = 150k (bajo tope IMM 553553 × 4.75 / 12 ≈ 219.116)
    expect(result.breakdown.gratification).toBe(150_000);

    const taxable = 600_000 + 150_000;
    expect(result.breakdown.total_taxable_income).toBe(taxable);

    // Bajo tope 90 UF × 40000 = 3_600_000
    expect(result.breakdown.sis_employer).toBe(Math.round(taxable * 0.02));
    expect(result.breakdown.pension_reform_employer).toBe(Math.round(taxable * 0.01));
  });

  it("Agosto 2026: SIS 0% + reforma 3,5% (includes_sis)", async () => {
    stubVersion(
      "ver-aug",
      buildAugust2026Parameters() as unknown as PayrollParameters,
      "2026-08-01",
      null
    );

    const result = await computeEmployerCost({
      ...baseInput,
      params_version_id: "ver-aug",
    });

    const taxable = result.breakdown.total_taxable_income;
    expect(result.breakdown.sis_employer).toBe(0);
    expect(result.breakdown.pension_reform_employer).toBe(Math.round(taxable * 0.035));
    // Base 600k → gratificación 150k (bajo tope); reforma sobre imponible
    expect(result.breakdown.gratification).toBe(150_000);
    expect(taxable).toBe(750_000);
  });

  it("versión vieja sin pension_reform: tasa 0 y no rompe", async () => {
    stubVersion(
      "ver-feb",
      legacyFebParamsWithoutReform(),
      "2026-02-01",
      "2026-02-28"
    );

    const result = await computeEmployerCost({
      ...baseInput,
      params_version_id: "ver-feb",
    });

    expect(result.breakdown.pension_reform_employer).toBe(0);
    expect(result.breakdown.sis_employer).toBeGreaterThan(0);
    expect(result.monthly_employer_cost_clp).toBeGreaterThan(600_000);
  });

  it("tope gratificación mensual = IMM × 4.75 / 12 con IMM 553553", async () => {
    stubVersion(
      "ver-aug",
      buildAugust2026Parameters() as unknown as PayrollParameters,
      "2026-08-01",
      null
    );

    const result = await computeEmployerCost({
      ...baseInput,
      base_salary_clp: 1_000_000, // 25% = 250k > tope
      params_version_id: "ver-aug",
    });

    // Brief §17: tope = $219.115 (IMM $553.553 × 4,75 / 12)
    expect(result.breakdown.gratification).toBe(219_115);
  });
});

