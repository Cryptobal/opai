/**
 * PAYROLL ENGINE - TYPES (VERSIÓN COMPLETA)
 * Sistema de liquidaciones y costeo para Chile - AUDIT READY
 */

// ============================================
// PARÁMETROS LEGALES COMPLETOS
// ============================================

export interface PayrollParameters {
  version_metadata: {
    name: string;
    effective_from: string;
    effective_until: string | null;
    source: string;
  };

  // AFP: 10% base + comisión variable
  afp: {
    base_rate: 0.10;
    commissions: {
      [afp_name: string]: {
        commission_rate: number;
        sis_included: false;
        last_updated: string; // Fecha última licitación
      };
    };
  };

  // SIS: Aporte EMPLEADOR
  sis: {
    employer_rate: number;
    applies_to: "employer";
    base: "pension_cap";
    imponible_previsional: false;
    imponible_tributario: false;
  };

  // Salud
  health: {
    fonasa: {
      rate: number;
      is_fixed: true;
    };
    isapre: {
      min_rate: number;
      is_fixed: false;
    };
  };

  // AFC: Desglosado en CIC + FCS
  afc: {
    indefinite: {
      worker: {
        cic_rate: number;
        fcs_rate: number;
        total_rate: number;
        imponible_previsional: false; // ← NUEVO
        imponible_tributario: false; // ← NUEVO
      };
      employer: {
        cic_rate: number;
        fcs_rate: number;
        total_rate: number;
      };
    };
    fixed_term: {
      worker: {
        cic_rate: number;
        fcs_rate: number;
        total_rate: number;
        imponible_previsional: false;
        imponible_tributario: false;
      };
      employer: {
        cic_rate: number;
        fcs_rate: number;
        total_rate: number;
      };
    };
  };

  // Topes en UF
  caps: {
    pension_uf: number;
    health_uf: number;
    work_injury_uf: number;
    afc_uf: number;
  };

  // Impuesto Único (tabla SII en CLP)
  tax_brackets: Array<{
    from_clp: number;
    to_clp: number | null;
    factor: number;
    rebate_clp: number;
    effective_rate_max: number;
  }>;

  // Mutual/Accidentes del Trabajo (Ley 16.744) ← AMPLIADO
  work_injury: {
    base_rate: number; // 0.93% base legal
    additional_rate_default: number; // 0% - 3.4% según siniestralidad
    employer_rate_default: number; // base + additional (ej: 0.95%)
    risk_levels: {
      low: number;
      medium: number;
      high: number;
      security_industry: number; // ← NUEVO: para seguridad privada
    };
    base: "pension_cap";
    imponible_previsional: false;
    imponible_tributario: false;
  };

  // Gratificación Legal ← AMPLIADO
  gratification: {
    regime_25_monthly: {
      enabled: true;
      monthly_rate: number; // 25%
      annual_cap_imm_multiple: number; // 4.75
      imponible_previsional: true;
      imponible_tributario: true;
    };
    regime_30_annual: {
      enabled: false; // Alternativa
      annual_rate: number; // 30%
      imponible_previsional: true;
      imponible_tributario: true;
    };
  };

  // Asignación Familiar ← NUEVO
  family_allowance: {
    enabled: boolean;
    tranches: Array<{
      from_clp: number;
      to_clp: number | null;
      amount_per_dependent: number;
      amount_maternal: number; // Asignación maternal
      amount_invalidity: number; // Asignación invalidez
    }>;
    imponible_previsional: false;
    imponible_tributario: false;
  };

  // IMM (Ingreso Mínimo Mensual) ← NUEVO
  imm: {
    value_clp: number;
    effective_from: string;
    imponible_previsional: true;
    imponible_tributario: true;
  };
}

// ============================================
// CONCEPTOS DE LIQUIDACIÓN
// ============================================

export interface SalaryComponent {
  code: string;
  name: string;
  type: "HABER" | "DESCUENTO";
  imponible_previsional: boolean; // Afecto a AFP, Salud, AFC
  imponible_tributario: boolean; // Afecto a Impuesto Único
  display_order: number;
}

// Catálogo de conceptos estándar Chile
export const STANDARD_COMPONENTS: SalaryComponent[] = [
  // HABERES IMPONIBLES
  { code: "SUELDO_BASE", name: "Sueldo Base", type: "HABER", imponible_previsional: true, imponible_tributario: true, display_order: 1 },
  { code: "GRATIFICACION", name: "Gratificación Legal", type: "HABER", imponible_previsional: true, imponible_tributario: true, display_order: 2 },
  { code: "HORAS_EXTRA_50", name: "Horas Extra 50%", type: "HABER", imponible_previsional: true, imponible_tributario: true, display_order: 3 },
  { code: "HORAS_EXTRA_100", name: "Horas Extra 100%", type: "HABER", imponible_previsional: true, imponible_tributario: true, display_order: 4 },
  { code: "COMISIONES", name: "Comisiones", type: "HABER", imponible_previsional: true, imponible_tributario: true, display_order: 5 },
  { code: "BONOS_IMPONIBLES", name: "Bonos Imponibles", type: "HABER", imponible_previsional: true, imponible_tributario: true, display_order: 6 },
  
  // HABERES NO IMPONIBLES
  { code: "COLACION", name: "Asignación Colación", type: "HABER", imponible_previsional: false, imponible_tributario: false, display_order: 10 },
  { code: "MOVILIZACION", name: "Asignación Movilización", type: "HABER", imponible_previsional: false, imponible_tributario: false, display_order: 11 },
  { code: "ASIG_FAMILIAR", name: "Asignación Familiar", type: "HABER", imponible_previsional: false, imponible_tributario: false, display_order: 12 },
  { code: "ASIG_MATERNAL", name: "Asignación Maternal", type: "HABER", imponible_previsional: false, imponible_tributario: false, display_order: 13 },
  { code: "VIATICOS", name: "Viáticos", type: "HABER", imponible_previsional: false, imponible_tributario: false, display_order: 14 },
  
  // DESCUENTOS LEGALES
  { code: "AFP", name: "AFP (10% + comisión)", type: "DESCUENTO", imponible_previsional: false, imponible_tributario: false, display_order: 20 },
  { code: "SALUD", name: "Salud (Fonasa/Isapre)", type: "DESCUENTO", imponible_previsional: false, imponible_tributario: false, display_order: 21 },
  { code: "AFC_TRABAJADOR", name: "AFC Trabajador", type: "DESCUENTO", imponible_previsional: false, imponible_tributario: false, display_order: 22 },
  { code: "IMPUESTO_UNICO", name: "Impuesto Único", type: "DESCUENTO", imponible_previsional: false, imponible_tributario: false, display_order: 23 },
  
  // DESCUENTOS VOLUNTARIOS
  { code: "APV", name: "Ahorro Previsional Voluntario", type: "DESCUENTO", imponible_previsional: false, imponible_tributario: true, display_order: 30 },
  { code: "PENSION_ALIMENTICIA", name: "Pensión Alimenticia", type: "DESCUENTO", imponible_previsional: false, imponible_tributario: false, display_order: 31 },
  { code: "PRESTAMO_EMPRESA", name: "Préstamo Empresa", type: "DESCUENTO", imponible_previsional: false, imponible_tributario: false, display_order: 32 },
  { code: "ANTICIPO", name: "Anticipo", type: "DESCUENTO", imponible_previsional: false, imponible_tributario: false, display_order: 33 },
  { code: "PRESTAMO_CAJA", name: "Préstamo Caja Compensación", type: "DESCUENTO", imponible_previsional: false, imponible_tributario: false, display_order: 34 },
];

// ============================================
// REFERENCIAS EXTERNAS (FX)
// ============================================

export interface FxReferences {
  uf_clp: number;
  uf_date: string;
  utm_clp: number;
  utm_month: string;
  imm_clp: number;
}

// ============================================
// ASSUMPTIONS (PROVISIONES)
// ============================================

export interface PayrollAssumptions {
  id?: string;
  name: string;
  vacation_provision_pct: number;
  severance_provision_pct: number;
  holiday_bonus_pct: number;
  christmas_bonus_pct: number;
  work_injury_basic_rate?: number;
  work_injury_additional_rate?: number;
  work_injury_extra_rate?: number;
  work_injury_total_rate?: number;
  work_injury_risk_level: "low" | "medium" | "high" | "security_industry" | "custom";
}

// ============================================
// EMPLOYER COST COMPUTATION
// ============================================

export interface EmployerCostInput {
  base_salary_clp: number;
  contract_type: "indefinite" | "fixed_term";
  
  // Configuración trabajador
  afp_name?: string;
  health_system?: "fonasa" | "isapre";
  health_plan_pct?: number;
  work_injury_risk?: "low" | "medium" | "high" | "security_industry";
  
  // Haberes adicionales
  include_gratification?: boolean; // Default: true
  overtime_hours_50?: number;
  commissions?: number;
  
  // Haberes no imponibles
  transport_allowance?: number;
  meal_allowance?: number;
  
  // Asignación familiar
  num_dependents?: number;
  has_maternal_allowance?: boolean;
  
  // Referencias
  params_version_id?: string;
  uf_value?: number;
  uf_date?: string;
  utm_value?: number;
  utm_month?: string;
  
  assumptions?: {
    include_gratification?: boolean;
    include_vacation_provision?: boolean;
    include_severance_provision?: boolean;
    vacation_provision_pct?: number;
    severance_provision_pct?: number;
    work_injury_override?: {
      basic_rate?: number;
      additional_rate?: number;
      extra_rate?: number;
      total_rate?: number;
    };
  };
}

export interface EmployerCostOutput {
  monthly_employer_cost_clp: number;
  breakdown: {
    base_salary: number;
    gratification: number;
    overtime: number;
    total_taxable_income: number;
    
    // Haberes no imponibles
    transport_allowance: number;
    meal_allowance: number;
    family_allowance: number;
    total_non_taxable_income: number;
    
    // Aportes empleador
    sis_employer: number;
    afc_employer: {
      cic: number;
      fcs: number;
      total: number;
    };
    work_injury_employer: {
      base_rate: number;
      additional_rate: number;
      total_rate: number;
      amount: number;
    };
    
    // Provisiones
    vacation_provision: number;
    severance_provision: number;
    
    subtotal_direct_cost: number;
    total_cost: number;
  };
  worker_breakdown_estimate: {
    afp: {
      base_rate: number;
      commission_rate: number;
      total_rate: number;
      amount: number;
    };
    health: number;
    afc: number;
    tax: number;
    total_deductions: number;
  };
  worker_net_salary_estimate: number;
  cost_to_net_ratio: number;
  parameters_snapshot: ParametersSnapshot;
  computed_at: string;
}

// ============================================
// PAYSLIP SIMULATION (COMPLETA)
// ============================================

export interface PayslipSimulationInput {
  // HABERES IMPONIBLES
  base_salary_clp: number;
  gratification_clp?: number; // Si no se provee, se calcula 25%
  overtime_hours_50?: number;
  overtime_hours_100?: number;
  commissions?: number;
  other_taxable_allowances?: number;
  
  // RECARGO FERIADO (horas trabajadas en días feriados)
  holiday_hours_worked?: number;

  // HABERES NO IMPONIBLES
  non_taxable_allowances?: {
    transport?: number;
    meal?: number;
    family?: number;
    maternal?: number;
    other?: number;
  };

  // DÍAS TRABAJADOS
  worked_days?: number;
  total_days_month?: number;
  
  // AUSENCIAS
  absence_days?: {
    sick_leave?: number; // Licencia médica (no descuenta)
    unpaid_leave?: number; // Permiso sin goce (descuenta)
    vacation?: number; // Vacaciones (no descuenta)
  };

  // CONFIGURACIÓN
  contract_type: "indefinite" | "fixed_term";
  afp_name: string;
  health_system: "fonasa" | "isapre";
  health_plan_pct?: number;
  
  // ASIGNACIÓN FAMILIAR
  num_dependents?: number;
  has_maternal_allowance?: boolean;
  has_invalidity_allowance?: boolean;

  // DESCUENTOS ADICIONALES
  additional_deductions?: {
    apv?: number; // Ahorro Previsional Voluntario (rebaja impuesto)
    pension_alimenticia?: number; // Pensión alimenticia (judicial)
    loan?: number; // Préstamo empresa
    advance?: number; // Anticipo
    caja_loan?: number; // Préstamo caja compensación
    other?: number;
  };

  // VERSIONADO
  params_version_id?: string;
  uf_value?: number;
  uf_date?: string;
  utm_value?: number;
  utm_month?: string;
  save_simulation?: boolean;
}

export interface PayslipSimulationOutput {
  simulation_id?: string;

  // HABERES
  haberes: {
    base_salary: number;
    gratification: number;
    holiday_surcharge: number;
    overtime_50: number;
    overtime_100: number;
    commissions: number;
    other_taxable: number;
    total_taxable: number;
    
    // No imponibles
    transport: number;
    meal: number;
    family_allowance: number;
    maternal_allowance: number;
    other_non_taxable: number;
    total_non_taxable: number;
    
    gross_salary: number; // Total haberes
  };

  // DESCUENTOS LEGALES
  deductions: {
    afp: {
      base_rate: number;
      commission_rate: number;
      total_rate: number;
      base_imponible: number;
      amount: number;
    };
    health: {
      rate: number;
      base_imponible: number;
      amount: number;
    };
    afc: {
      worker_cic_rate: number;
      worker_fcs_rate: number;
      total_rate: number;
      base_imponible: number;
      amount: number;
    };
    apv: {
      amount: number;
      rebate_tax: boolean;
    };
    tax: {
      base_clp: number; // Base tributable (después de AFP, Salud, AFC, APV)
      bracket_index: number;
      factor: number;
      rebate_clp: number;
      amount: number;
    };
    total_legal: number;
  };

  // DESCUENTOS VOLUNTARIOS
  voluntary_deductions: {
    pension_alimenticia: number;
    loan: number;
    advance: number;
    caja_loan: number;
    other: number;
    total: number;
  };

  total_deductions: number;
  net_salary: number;

  // COSTO EMPLEADOR
  employer_cost: {
    sis: {
      rate: number;
      base: number;
      amount: number;
    };
    afc: {
      cic_rate: number;
      fcs_rate: number;
      total_rate: number;
      base: number;
      cic_amount: number;
      fcs_amount: number;
      total_amount: number;
    };
    work_injury: {
      base_rate: number;
      additional_rate: number;
      total_rate: number;
      base: number;
      amount: number;
    };
    total: number;
  };

  total_employer_cost: number;
  parameters_snapshot: ParametersSnapshot;
  computed_at: string;
}

// ============================================
// SNAPSHOTS INMUTABLES
// ============================================

export interface ParametersSnapshot {
  version_id: string;
  effective_from: string;
  effective_until: string | null;
  name: string;

  references_at_calculation: {
    uf_clp: number;
    uf_date: string;
    utm_clp: number;
    utm_month: string;
    imm_clp: number;
    captured_at: string;
  };

  caps_clp: {
    pension: number;
    health: number;
    work_injury: number;
    afc: number;
  };

  full_data: PayrollParameters;
}
