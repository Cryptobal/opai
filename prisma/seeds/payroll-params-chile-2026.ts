/**
 * Parámetros legales Chile 2026 — builders compartidos entre seed y
 * scripts/update-payroll-parameters-2026.ts.
 *
 * Fuentes: Previred jul-2026, Superintendencia de Pensiones, SUSESO,
 * Ley 21.735, reajuste IMM mayo/junio 2026.
 */

/** Campos comunes vigentes desde julio 2026 (topes, IMM, asig. familiar, AFP, etc.) */
export function buildCommonLegalParams2026() {
  return {
    afp: {
      base_rate: 0.1,
      commissions: {
        uno: { commission_rate: 0.0046, sis_included: false, last_updated: "2026-07-01" },
        modelo: { commission_rate: 0.0058, sis_included: false, last_updated: "2026-07-01" },
        planvital: { commission_rate: 0.0116, sis_included: false, last_updated: "2026-07-01" },
        habitat: { commission_rate: 0.0127, sis_included: false, last_updated: "2026-07-01" },
        capital: { commission_rate: 0.0144, sis_included: false, last_updated: "2026-07-01" },
        cuprum: { commission_rate: 0.0144, sis_included: false, last_updated: "2026-07-01" },
        provida: { commission_rate: 0.0145, sis_included: false, last_updated: "2026-07-01" },
      },
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
          imponible_previsional: false,
          imponible_tributario: false,
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
          imponible_previsional: false,
          imponible_tributario: false,
        },
        employer: {
          cic_rate: 0.028,
          fcs_rate: 0.002,
          total_rate: 0.03,
        },
      },
    },

    // Topes definitivos 2026 (SP / Previred)
    caps: {
      pension_uf: 90.0,
      health_uf: 90.0,
      work_injury_uf: 90.0,
      afc_uf: 135.2,
    },

    // Tabla impuesto único (misma estructura; refresco SII secundario)
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
      base: "pension_cap" as const,
      imponible_previsional: false as const,
      imponible_tributario: false as const,
    },

    gratification: {
      regime_25_monthly: {
        enabled: true as const,
        monthly_rate: 0.25,
        annual_cap_imm_multiple: 4.75,
        imponible_previsional: true,
        imponible_tributario: true,
      },
      regime_30_annual: {
        enabled: false as const,
        annual_rate: 0.3,
        imponible_previsional: true,
        imponible_tributario: true,
      },
    },

    // Tramos asignación familiar vigentes jul-2026
    family_allowance: {
      enabled: true,
      tranches: [
        {
          from_clp: 0,
          to_clp: 649039,
          amount_per_dependent: 22601,
          amount_maternal: 22601,
          amount_invalidity: 22601,
        },
        {
          from_clp: 649040,
          to_clp: 947990,
          amount_per_dependent: 13870,
          amount_maternal: 13870,
          amount_invalidity: 13870,
        },
        {
          from_clp: 947991,
          to_clp: 1478539,
          amount_per_dependent: 4382,
          amount_maternal: 4382,
          amount_invalidity: 4382,
        },
        {
          from_clp: 1478540,
          to_clp: null,
          amount_per_dependent: 0,
          amount_maternal: 0,
          amount_invalidity: 0,
        },
      ],
      imponible_previsional: false,
      imponible_tributario: false,
    },

    // IMM reajuste mayo 2026 (vigente jul/ago)
    imm: {
      value_clp: 553553,
      effective_from: "2026-05-01",
      imponible_previsional: true,
      imponible_tributario: true,
    },

    apv: {
      max_monthly_uf: 50,
      max_annual_uf: 600,
      regime_b_tax_deduction: true,
    },
  };
}

export const JULY_2026_VERSION_NAME = "Parámetros Legales Chile - Julio 2026";
export const AUGUST_2026_VERSION_NAME =
  "Parámetros Legales Chile - Agosto 2026 en adelante";

/** Julio 2026: SIS 2,00% aparte + reforma 1,0% (CI 0,1% + Seguro Social 0,9%) */
export function buildJuly2026Parameters() {
  const common = buildCommonLegalParams2026();
  return {
    version_metadata: {
      name: JULY_2026_VERSION_NAME,
      effective_from: "2026-07-01",
      effective_until: "2026-07-31",
      source:
        "Previred jul-2026, Superintendencia de Pensiones, SUSESO, Ley 21.735",
    },
    ...common,
    sis: {
      employer_rate: 0.02,
      applies_to: "employer" as const,
      base: "pension_cap" as const,
      imponible_previsional: false as const,
      imponible_tributario: false as const,
    },
    pension_reform: {
      law: "21735" as const,
      employer_rate: 0.01,
      includes_sis: false,
      base: "pension_cap" as const,
    },
  };
}

/**
 * Agosto 2026 en adelante: reforma 3,5% consolida SIS
 * (sis.employer_rate = 0; includes_sis = true).
 */
export function buildAugust2026Parameters() {
  const common = buildCommonLegalParams2026();
  return {
    version_metadata: {
      name: AUGUST_2026_VERSION_NAME,
      effective_from: "2026-08-01",
      effective_until: null,
      source:
        "Previred, Superintendencia de Pensiones, SUSESO, Ley 21.735 (gradualidad ago-2026)",
    },
    ...common,
    sis: {
      employer_rate: 0.0,
      applies_to: "employer" as const,
      base: "pension_cap" as const,
      imponible_previsional: false as const,
      imponible_tributario: false as const,
    },
    pension_reform: {
      law: "21735" as const,
      employer_rate: 0.035,
      includes_sis: true,
      base: "pension_cap" as const,
    },
  };
}
