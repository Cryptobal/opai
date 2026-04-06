/**
 * Tenant Module Management — Feature flags por tenant
 *
 * Controla qué módulos tiene habilitado cada tenant según su plan.
 * Cache in-memory de 5 minutos (mismo patrón que tenant-config.ts).
 */

import { prisma } from "@/lib/prisma";

// ── Definición de módulos y planes ──

export const ALL_MODULES = [
  // Core (siempre disponible con cualquier plan)
  "hub",
  "config",
  "portal_guardia",
  "portal_marcacion",

  // Operaciones core
  "ops_asistencia",     // Marcaciones GPS + QR + foto
  "ops_pauta",          // Pautas mensuales/diarias, drag & drop
  "ops_pce",            // Puestos por cubrir
  "ops_turnos_extra",   // Turnos extras + plantillas bancarias
  "ops_refuerzos",      // Refuerzos sincronizados con facturación
  "ops_onboarding",     // Onboarding de guardias
  "ops_audit",          // Auditoría de pautas
  "tickets",            // Tickets internos y externos + SLA
  "documentos",         // Gestor documental + templates + firma
  "personas",           // Fichas, comunicaciones, sueldos

  // Supervisión y alertas (Plan Profesional)
  "ops_supervision",    // Supervisión GPS, rutas, encuestas
  "portal_supervisor",  // Portal del supervisor
  "alertas_cobertura",  // Alertas push + email + WhatsApp
  "chat",               // Chat interno + externo en tiempo real
  "gamificacion",       // Sistema de puntos e incentivos
  "protocolos_ia",      // Protocolos con IA + exámenes a guardias
  "contratos",          // Contratos con control de cambios + firma digital

  // Add-ons (compra separada o incluidos en Enterprise)
  "crm",                // CRM completo: leads, cuentas, deals, contactos, prospección
  "cpq",                // Cotizador + cálculo empleador + PDF + email tracking
  "ops_rondas",         // Rondas GPS: checkpoints, monitoreo, centro IA, portal
  "ops_inventario",     // Stock, bodegas, compras, entregas, activos, líneas
  "portal_cliente",     // Portal del cliente
  "payroll",            // Liquidaciones Chile, anticipos, bonos, simulador
  "finanzas",           // Facturación SII, rendiciones, bancos, contabilidad
  "ats",                // ATS reclutamiento + publicación multi-plataforma
  "face_id",            // Face ID biométrico AWS Rekognition
  "ia_operacional",     // IA: RAG, OCR, análisis, asistente, contenido CPQ
  "control_acceso",     // Control de acceso QR, OCR patentes, portal
  "fiscalizacion",      // Portal inspector DT + reportes DT
  "reportes_dt",        // Reportes de asistencia DT (separado de fiscalización)
  "control_nocturno",   // Control nocturno IA
  "white_label",        // Dominio propio, marca personalizada
  "app_nativa",         // App iOS/Android nativa
] as const;

export type TenantModuleKey = (typeof ALL_MODULES)[number];

export const PLAN_MODULES: Record<string, TenantModuleKey[]> = {
  free: [
    // Core siempre incluido
    "hub", "config", "portal_guardia", "portal_marcacion",
    // Operaciones básicas
    "ops_asistencia", "ops_pauta", "personas",
    // Tickets básico
    "tickets",
  ],
  starter: [
    // Todo lo del free
    "hub", "config", "portal_guardia", "portal_marcacion",
    "ops_asistencia", "ops_pauta", "personas", "tickets",
    // + Operaciones completas
    "ops_pce", "ops_turnos_extra", "ops_refuerzos", "ops_onboarding", "ops_audit",
    // + Documentos y firma
    "documentos",
    // + Portal supervisor
    "portal_supervisor",
    // + Contratos
    "contratos",
  ],
  profesional: [
    // Todo lo del starter
    "hub", "config", "portal_guardia", "portal_marcacion",
    "ops_asistencia", "ops_pauta", "personas", "tickets",
    "ops_pce", "ops_turnos_extra", "ops_refuerzos", "ops_onboarding", "ops_audit",
    "documentos", "portal_supervisor", "contratos",
    // + Supervisión y alertas
    "ops_supervision", "alertas_cobertura",
    // + Comunicación
    "chat",
    // + Gamificación
    "gamificacion",
    // + Protocolos e IA básica
    "protocolos_ia",
    // + Reportes DT básicos
    "reportes_dt",
  ],
  enterprise: [
    ...(ALL_MODULES as unknown as TenantModuleKey[]),
  ],
};
// Backward compatibility aliases
PLAN_MODULES.trial = PLAN_MODULES.free;
PLAN_MODULES.essential = PLAN_MODULES.starter;
PLAN_MODULES.professional = PLAN_MODULES.profesional;

// ── Cache ──

const moduleCache = new Map<string, { modules: Set<string>; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function clearTenantModuleCache(tenantId?: string): void {
  if (tenantId) {
    moduleCache.delete(tenantId);
  } else {
    moduleCache.clear();
  }
}

// ── Main functions ──

/**
 * Obtiene los módulos habilitados para un tenant.
 * Si el tenant no tiene registros en TenantModule, retorna todos
 * los módulos (backward compatibility con tenants existentes).
 */
export async function getTenantEnabledModules(
  tenantId: string,
): Promise<Set<string>> {
  const cached = moduleCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.modules;
  }

  const modules = await prisma.tenantModule.findMany({
    where: { tenantId, enabled: true },
    select: { module: true },
  });

  // Si no hay registros, asumir todos habilitados (backward compat para Gard)
  const moduleSet =
    modules.length > 0
      ? new Set(modules.map((m) => m.module))
      : new Set<string>(ALL_MODULES);

  moduleCache.set(tenantId, { modules: moduleSet, ts: Date.now() });
  return moduleSet;
}

/**
 * Verifica si un módulo específico está habilitado para un tenant.
 */
export async function isTenantModuleEnabled(
  tenantId: string,
  module: TenantModuleKey,
): Promise<boolean> {
  const modules = await getTenantEnabledModules(tenantId);
  return modules.has(module);
}

/**
 * Retorna los módulos habilitados como array (útil para UI).
 */
export async function getTenantModulesList(
  tenantId: string,
): Promise<string[]> {
  const modules = await getTenantEnabledModules(tenantId);
  return Array.from(modules);
}
