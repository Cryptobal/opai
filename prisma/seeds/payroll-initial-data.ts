/**
 * PAYROLL INITIAL SEED DATA
 * Parámetros legales Chile Febrero 2026 + UF/UTM
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function seedPayrollData() {
  console.log("🌱 Seeding Payroll data...");

  // 1. Crear tabla FX: UF Rates (febrero 2026)
  console.log("   → Creating UF rates...");
  await prisma.fxUfRate.upsert({
    where: { date: new Date("2026-02-01") },
    update: {},
    create: {
      date: new Date("2026-02-01"),
      value: 39703.50,
      source: "SBIF",
      fetchedAt: new Date(),
    },
  });

  // 2. Crear tabla FX: UTM Rates (febrero 2026)
  console.log("   → Creating UTM rates...");
  await prisma.fxUtmRate.upsert({
    where: { month: new Date("2026-02-01") },
    update: {},
    create: {
      month: new Date("2026-02-01"),
      value: 69611,
      source: "SII",
      fetchedAt: new Date(),
    },
  });

  // 3. Crear assumptions por defecto (buscar por isDefault en lugar de ID)
  console.log("   → Creating default assumptions...");
  const existingAssumption = await prisma.payrollAssumption.findFirst({
    where: { isDefault: true },
  });

  if (!existingAssumption) {
    await prisma.payrollAssumption.create({
      data: {
        name: "Assumptions Por Defecto Chile",
        description: "Provisiones estándar para costeo empleador",
        vacationProvisionPct: 0.0833,
        severanceProvisionPct: 0.0,
        holidayBonusPct: 0.0,
        christmasBonusPct: 0.0,
        workInjuryRiskLevel: "medium",
        isDefault: true,
      },
    });
  }

  // 4. Crear versión de parámetros legales (Febrero 2026)
  console.log("   → Creating parameter version (Feb 2026)...");

  const parametersData = {
    version_metadata: {
      name: "Parámetros Legales Chile - Febrero 2026",
      effective_from: "2026-02-01",
      effective_until: "2026-02-29",
      source: "SII, Previred, Superintendencia de Pensiones",
    },

    afp: {
      base_rate: 0.1,
      commissions: {
        uno: { commission_rate: 0.0046, sis_included: false },
        modelo: { commission_rate: 0.0058, sis_included: false },
        planvital: { commission_rate: 0.0116, sis_included: false },
        habitat: { commission_rate: 0.0127, sis_included: false },
        capital: { commission_rate: 0.0144, sis_included: false },
        cuprum: { commission_rate: 0.0144, sis_included: false },
        provida: { commission_rate: 0.0145, sis_included: false },
      },
    },

    sis: {
      employer_rate: 0.0154,
      applies_to: "employer",
      base: "pension_cap",
    },

    health: {
      fonasa: { rate: 0.07, is_fixed: true },
      isapre: { min_rate: 0.07, is_fixed: false },
    },

    afc: {
      indefinite: {
        worker: {
          cic_rate: 0.006,
          fcs_rate: 0.0,
          total_rate: 0.006,
        },
        employer: {
          cic_rate: 0.016,
          fcs_rate: 0.008,
          total_rate: 0.024,
        },
      },
      fixed_term: {
        worker: {
          cic_rate: 0.0,
          fcs_rate: 0.0,
          total_rate: 0.0,
        },
        employer: {
          cic_rate: 0.028,
          fcs_rate: 0.002,
          total_rate: 0.03,
        },
      },
    },

    caps: {
      pension_uf: 89.9,
      health_uf: 89.9,
      work_injury_uf: 89.9,
      afc_uf: 135.1,
    },

    tax_brackets: [
      {
        from_clp: 0,
        to_clp: 939748.5,
        factor: 0,
        rebate_clp: 0,
        effective_rate_max: 0,
      },
      {
        from_clp: 939748.51,
        to_clp: 2088330.0,
        factor: 0.04,
        rebate_clp: 37589.94,
        effective_rate_max: 0.022,
      },
      {
        from_clp: 2088330.01,
        to_clp: 3480550.0,
        factor: 0.08,
        rebate_clp: 121123.14,
        effective_rate_max: 0.0452,
      },
      {
        from_clp: 3480550.01,
        to_clp: 4872770.0,
        factor: 0.135,
        rebate_clp: 312553.39,
        effective_rate_max: 0.0709,
      },
      {
        from_clp: 4872770.01,
        to_clp: 6264990.0,
        factor: 0.23,
        rebate_clp: 775466.54,
        effective_rate_max: 0.1062,
      },
      {
        from_clp: 6264990.01,
        to_clp: 8353320.0,
        factor: 0.304,
        rebate_clp: 1239075.8,
        effective_rate_max: 0.1557,
      },
      {
        from_clp: 8353320.01,
        to_clp: 21579410.0,
        factor: 0.35,
        rebate_clp: 1623328.52,
        effective_rate_max: 0.2748,
      },
      {
        from_clp: 21579410.01,
        to_clp: null,
        factor: 0.4,
        rebate_clp: 2702299.02,
        effective_rate_max: 0.4,
      },
    ],

    work_injury: {
      base_rate: 0.0093,
      additional_rate_default: 0.0000,
      employer_rate_default: 0.0093,
      risk_levels: {
        low: 0.0093,
        medium: 0.0095,
        high: 0.0134,
        security_industry: 0.0120,
      },
      base: "pension_cap",
      imponible_previsional: false,
      imponible_tributario: false,
    },

    gratification: {
      regime_25_monthly: {
        enabled: true,
        monthly_rate: 0.25,
        annual_cap_imm_multiple: 4.75,
        imponible_previsional: true,
        imponible_tributario: true,
      },
      regime_30_annual: {
        enabled: false,
        annual_rate: 0.30,
        imponible_previsional: true,
        imponible_tributario: true,
      },
    },

    family_allowance: {
      enabled: true,
      tranches: [
        { from_clp: 0, to_clp: 631976, amount_per_dependent: 22007, amount_maternal: 22007, amount_invalidity: 22007 },
        { from_clp: 631977, to_clp: 923067, amount_per_dependent: 13505, amount_maternal: 13505, amount_invalidity: 13505 },
        { from_clp: 923068, to_clp: 1439668, amount_per_dependent: 4267, amount_maternal: 4267, amount_invalidity: 4267 },
        { from_clp: 1439669, to_clp: null, amount_per_dependent: 0, amount_maternal: 0, amount_invalidity: 0 }
      ],
      imponible_previsional: false,
      imponible_tributario: false,
    },

    imm: {
      value_clp: 500000,
      effective_from: "2024-07-01",
      imponible_previsional: true,
      imponible_tributario: true,
    },

    apv: {
      max_monthly_uf: 50,
      max_annual_uf: 600,
      regime_b_tax_deduction: true,
    },
  };

  const existingParams = await prisma.payrollParameterVersion.findFirst({
    where: { name: "Parámetros Legales Chile - Febrero 2026" },
  });

  if (!existingParams) {
    await prisma.payrollParameterVersion.create({
      data: {
        name: "Parámetros Legales Chile - Febrero 2026",
        description: "Tasas y topes oficiales vigentes para febrero 2026",
        effectiveFrom: new Date("2026-02-01"),
        effectiveUntil: new Date("2026-02-29"),
        data: parametersData as any,
        isActive: true,
        createdBy: "system",
      },
    });
  }

  console.log("✅ Payroll data seeded successfully!");
}

// Exportar para uso desde otros scripts
export default seedPayrollData;
