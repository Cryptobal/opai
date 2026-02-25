/**
 * Tipos completos para el Payload de Presentación
 * Basado en las 29 secciones definidas en Presentacion-Comercial.md
 */

import { ThemeVariant, PricingCurrency, ContactInfo, CTALinks, CompanyAssets } from './index';

// ============================================
// Cliente y Cotización
// ============================================

export interface ClientData {
  company_name: string;
  company_description?: string;
  company_logo_url?: string | null;
  contact_name: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_title?: string;
  contact_department?: string;
  contact_email: string;
  contact_phone?: string;
  contact_mobile?: string;
  
  // Datos de la empresa
  phone?: string;
  website?: string;
  industry?: string;
  rut?: string;
  giro?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface QuoteData {
  number: string;
  date: string;
  valid_until: string;
  created_date?: string;
  subject?: string;
  description?: string;
  subtotal?: number;
  tax?: number;
  total: number;
  currency: PricingCurrency;
}

// ============================================
// Servicios y Operación
// ============================================

export interface Site {
  name: string;
  address: string;
  comuna?: string;
  industry_type?: string;
}

export interface Position {
  title: string;
  schedule: string;
  shift_type: string;  // '6x1', '5x2', etc.
  quantity: number;
}

export interface ServiceData {
  scope_summary: string;
  sites: Site[];
  positions: Position[];
  coverage_hours?: string;
  start_date?: string;
}

// ============================================
// Pricing
// ============================================

export interface PricingItem {
  name?: string; // Nombre del producto/servicio (ej: "Puesto de Seguridad (PSEG)")
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  currency: PricingCurrency;
  notes?: string;
}

export interface PricingData {
  items: PricingItem[];
  subtotal: number;
  tax: number;
  total: number;
  total_uf?: number;
  currency: PricingCurrency;
  payment_terms?: string;
  adjustment_terms?: string;
  billing_frequency?: 'monthly' | 'quarterly' | 'annual';
  notes?: string[];
}

// ============================================
// Contenido de Secciones Específicas
// ============================================

export interface KpiMetric {
  value: string | number;
  label: string;
  delta?: string;
  note?: string;
}

export interface Challenge {
  icon: string;
  title: string;
  description: string;
}

export interface Feature {
  icon: string;
  title: string;
  description: string;
}

export interface ScopeItem {
  name: string;
  included: boolean;
  note?: string;
}

export interface TimelineStep {
  week: string;
  title: string;
  description: string;
  duration?: string;
}

export interface ProcessStep {
  step: number;
  title: string;
  description: string;
  deliverable?: string;
}

export interface CaseStudy {
  sector: string;
  sites: number;
  staffing: string;
  duration: string;
  metrics: KpiMetric[];
  quote: string;
  client_name?: string;
}

export interface ComparisonRow {
  criterion: string;
  market: string | boolean;
  gard: string | boolean;
  highlight?: boolean;
}

export interface ImplementationPhase {
  week: number;
  title: string;
  description: string;
  client_requirements?: string[];
  deliverables: string[];
}

// ============================================
// Secciones S01-S29
// ============================================

export interface Section01_Hero {
  headline: string;
  subheadline: string;
  microcopy: string;
  personalization: string;
  cta_primary_text: string;
  cta_secondary_text: string;
  background_image: string;
  kpi_overlay?: KpiMetric;
}

export interface Section02_ExecutiveSummary {
  commitment_title: string;
  commitment_text: string;
  differentiators: string[];
  traditional_model_reality: string[];
  impact_metrics: KpiMetric[];
}

export interface Section03_Transparencia {
  main_phrase: string;
  protocol_steps: {
    detection: string;
    report: string;
    action: string;
  };
  kpis: KpiMetric[];
}

export interface Section04_Riesgo {
  headline: string;
  symptoms: Challenge[];
  statistic: string;
}

export interface Section05_FallasModelo {
  table_rows: {
    characteristic: string;
    operational_consequence: string;
    financial_impact: string;
  }[];
}

export interface Section06_CostoReal {
  cost_cards: {
    title: string;
    description: string;
    estimated_impact: string;
  }[];
  conclusion_note: string;
}

export interface Section07_SistemaCapas {
  intro_text: string;
  layers: {
    level: number;
    name: string;
    description: string;
  }[];
}

export interface Section08_4Pilares {
  pillar1: { title: string; description: string; details: string[] };
  pillar2: { title: string; description: string; details: string[] };
  pillar3: { title: string; description: string; details: string[] };
  pillar4: { title: string; description: string; details: string[] };
}

export interface Section09_ComoOperamos {
  stages: ProcessStep[];
}

export interface Section10_Supervision {
  levels: {
    level: number;
    name: string;
    description: string;
    frequency: string;
  }[];
  night_shift_timeline: {
    time: string;
    activity: string;
  }[];
  sla: string[];
}

export interface Section11_Reportabilidad {
  daily: { title: string; items: string[] };
  weekly: { title: string; items: string[] };
  monthly: { title: string; items: string[] };
  dashboard_preview?: string;
}

export interface Section12_Cumplimiento {
  intro_text: string;
  risks: string[];
  guarantees: string[];
  commitment_time: string;
}

export interface Section13_Certificaciones {
  os10_qr: string;
  ley_karin_info: string;
  ethics_code: string;
  screening_checks: string[];
}

export interface Section14_Tecnologia {
  tools: {
    name: string;
    what_is_it: string;
    purpose: string;
    real_benefit: string;
  }[];
  note: string;
}

export interface Section15_Seleccion {
  funnel: {
    stage: string;
    quantity: number;
  }[];
  criteria_table: {
    criterion: string;
    description: string;
  }[];
  retention_rate: string;
}

export interface Section16_NuestraGente {
  message: string;
  photos: string[];
  values: {
    title: string;
    description: string;
  }[];
}

export interface Section17_Continuidad {
  scenarios: {
    title: string;
    description: string;
    response_time: string;
  }[];
  sla_coverage: string;
  kpi_compliance: string;
}

export interface Section18_KPIs {
  indicators: {
    name: string;
    description: string;
    target: string;
    measurement_frequency: string;
  }[];
  review_note: string;
}

export interface Section19_Resultados {
  case_studies: CaseStudy[];
}

export interface Section20_Clientes {
  client_logos: string[];
  confidentiality_note: string;
}

export interface Section21_Sectores {
  industries: {
    name: string;
    typical_needs: string[];
    icon?: string;
  }[];
}

export interface Section22_TCO {
  comparison_columns: {
    low_cost_high_risk: {
      monthly_rate: number;
      annual_rate: number;
      hidden_costs: number;
      total_real: number;
    };
    controlled_cost_low_risk: {
      monthly_rate: number;
      annual_rate: number;
      hidden_costs: number;
      total_real: number;
    };
  };
  message: string;
  currency: PricingCurrency;
}

export interface Section23_PropuestaEconomica {
  pricing: PricingData;
  /** AI-generated service detail to show below pricing table */
  serviceDetail?: string;
}

export interface Section24_TerminosCondiciones {
  client_must_provide: string[];
  service_includes: string[];
}

export interface Section25_Comparacion {
  comparison_table: ComparisonRow[];
}

export interface Section26_PorQueEligen {
  reasons: string[];
  renewal_rate: string;
}

export interface Section27_Implementacion {
  phases: ImplementationPhase[];
  total_duration: string;
}

export interface Section28_Cierre {
  headline: string;
  cta_primary: {
    text: string;
    link: string;
  };
  cta_secondary: {
    text: string;
    link: string;
  };
  microcopy: string;
}

export interface Section29_Contacto {
  email: string;
  phone: string;
  website: string;
  address: string;
  social_media: {
    linkedin?: string;
    instagram?: string;
    x?: string;
    youtube?: string;
  };
}

// ============================================
// Payload Principal de Presentación
// ============================================

export interface PresentationSections {
  s01_hero: Section01_Hero;
  s02_executive_summary: Section02_ExecutiveSummary;
  s03_transparencia: Section03_Transparencia;
  s04_riesgo: Section04_Riesgo;
  s05_fallas_modelo: Section05_FallasModelo;
  s06_costo_real: Section06_CostoReal;
  s07_sistema_capas: Section07_SistemaCapas;
  s08_4_pilares: Section08_4Pilares;
  s09_como_operamos: Section09_ComoOperamos;
  s10_supervision: Section10_Supervision;
  s11_reportabilidad: Section11_Reportabilidad;
  s12_cumplimiento: Section12_Cumplimiento;
  s13_certificaciones: Section13_Certificaciones;
  s14_tecnologia: Section14_Tecnologia;
  s15_seleccion: Section15_Seleccion;
  s16_nuestra_gente: Section16_NuestraGente;
  s17_continuidad: Section17_Continuidad;
  s18_kpis: Section18_KPIs;
  s19_resultados: Section19_Resultados;
  s20_clientes: Section20_Clientes;
  s21_sectores: Section21_Sectores;
  s22_tco: Section22_TCO;
  s23_propuesta_economica: Section23_PropuestaEconomica;
  s24_terminos_condiciones: Section24_TerminosCondiciones;
  s25_comparacion: Section25_Comparacion;
  s26_porque_eligen: Section26_PorQueEligen;
  s27_implementacion: Section27_Implementacion;
  s28_cierre: Section28_Cierre;
  s29_contacto: Section29_Contacto;
}

/**
 * Payload completo de una presentación
 * Este es el contrato principal que consume PresentationRenderer
 */
export interface PresentationPayload {
  // Metadatos
  id: string;
  template_id: string;
  theme: ThemeVariant;
  created_at: string;
  updated_at?: string;

  // Contexto CRM (populated by cpq-mapper for preview/header display)
  _dealName?: string;
  _installationName?: string;
  _cpqQuoteId?: string;

  // Datos del cliente y cotización
  client: ClientData;
  quote: QuoteData;
  service: ServiceData;
  
  // Assets visuales
  assets: CompanyAssets;
  
  // CTAs y contacto
  cta: CTALinks;
  contact: ContactInfo;
  
  // Contenido de las 29 secciones
  sections: PresentationSections;
}
