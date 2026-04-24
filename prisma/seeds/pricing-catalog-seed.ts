import type { PrismaClient } from '@prisma/client';

export async function seedPricingCatalog(prisma: PrismaClient) {
  console.log('Seeding pricing catalog...');

  // Plans — aligned with PLAN_MODULES in src/lib/tenant-modules.ts
  const plans = [
    {
      slug: "free",
      name: "Gratis",
      headline: "Para siempre",
      description: "Digitaliza tu operación sin costo. Hasta 10 guardias activos.",
      pricePerGuard: 0,
      baseMinimum: 0,
      maxGuards: 10,
      maxAdmins: 1,
      maxStorageMb: 500,
      includedModules: [
        "hub", "config", "portal_guardia", "portal_marcacion",
        "ops_asistencia", "ops_pauta",
        "personas", "tickets",
      ],
      trialDays: 0,
      sortOrder: 0,
      featured: false,
    },
    {
      slug: "starter",
      name: "Starter",
      headline: "Para crecer",
      description: "Operación profesional con tickets, documentos, comunicaciones y auditoría.",
      pricePerGuard: 0.5,
      baseMinimum: 20,
      maxGuards: 200,
      maxAdmins: 5,
      maxStorageMb: 2000,
      includedModules: [
        "hub", "config", "portal_guardia", "portal_marcacion",
        "ops_asistencia", "ops_pauta", "ops_pce", "ops_turnos_extra",
        "ops_refuerzos", "ops_onboarding", "ops_audit",
        "personas", "tickets", "documentos", "contratos",
        "portal_supervisor",
      ],
      trialDays: 30,
      sortOrder: 1,
      featured: false,
    },
    {
      slug: "profesional",
      name: "Profesional",
      headline: "El más elegido",
      description: "Control total: supervisión GPS, alertas WhatsApp, chat, firma digital y portales avanzados.",
      pricePerGuard: 0.8,
      baseMinimum: 45,
      maxGuards: 500,
      maxAdmins: 15,
      maxStorageMb: 5000,
      includedModules: [
        "hub", "config", "portal_guardia", "portal_marcacion",
        "ops_asistencia", "ops_pauta", "ops_pce", "ops_turnos_extra",
        "ops_refuerzos", "ops_onboarding", "ops_audit",
        "personas", "tickets", "documentos", "contratos",
        "portal_supervisor",
        "ops_supervision", "alertas_cobertura",
        "chat", "gamificacion", "protocolos_ia", "reportes_dt",
      ],
      trialDays: 30,
      sortOrder: 2,
      featured: true,
    },
    {
      slug: "enterprise",
      name: "Enterprise",
      headline: "Sin límites",
      description: "Todo OPAI. Todos los add-ons incluidos, IA, biometría, SLA garantizado.",
      pricePerGuard: 0,
      baseMinimum: 0,
      maxGuards: 9999,
      maxAdmins: 999,
      maxStorageMb: 50000,
      includedModules: [
        "hub", "config", "portal_guardia", "portal_marcacion",
        "ops_asistencia", "ops_pauta", "ops_pce", "ops_turnos_extra",
        "ops_refuerzos", "ops_onboarding", "ops_audit",
        "personas", "tickets", "documentos", "contratos",
        "portal_supervisor",
        "ops_supervision", "alertas_cobertura",
        "chat", "gamificacion", "protocolos_ia", "reportes_dt",
        "crm", "cpq", "ops_rondas", "ops_inventario",
        "portal_cliente", "payroll", "finanzas",
        "ats", "face_id", "ia_operacional", "control_acceso",
        "fiscalizacion", "control_nocturno", "white_label", "app_nativa",
        "psych",
      ],
      trialDays: 30,
      sortOrder: 3,
      featured: false,
    },
  ];

  for (const p of plans) {
    await prisma.planCatalog.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        pricePerGuard: p.pricePerGuard,
        baseMinimum: p.baseMinimum,
        maxGuards: p.maxGuards,
        maxAdmins: p.maxAdmins,
        maxStorageMb: p.maxStorageMb,
        includedModules: p.includedModules,
      },
      create: p,
    });
  }
  console.log(`  ${plans.length} plans`);

  // Add-ons — moduleKey must match a key in ALL_MODULES
  const addons = [
    { slug: "rondas_gps", name: "Rondas GPS", pricingModel: "per_guard", priceAmount: 0.15, priceUnit: "guardia/mes", moduleKey: "ops_rondas", tag: "Operacional", sortOrder: 0 },
    { slug: "control_nocturno", name: "Control Nocturno IA", pricingModel: "per_guard", priceAmount: 0.10, priceUnit: "guardia/mes", moduleKey: "control_nocturno", tag: "Operacional", sortOrder: 1 },
    { slug: "inventario", name: "Inventario", pricingModel: "flat", priceAmount: 5, priceUnit: "mes", moduleKey: "ops_inventario", tag: "Operacional", sortOrder: 2 },
    { slug: "crm", name: "CRM Comercial", pricingModel: "flat", priceAmount: 8, priceUnit: "mes", moduleKey: "crm", tag: "Comercial", sortOrder: 3 },
    { slug: "cpq", name: "CPQ (Cotizador)", pricingModel: "flat", priceAmount: 5, priceUnit: "mes", moduleKey: "cpq", tag: "Comercial", sortOrder: 4 },
    { slug: "portal_cliente", name: "Portal Cliente", pricingModel: "per_unit", priceAmount: 3, priceUnit: "cliente activo/mes", moduleKey: "portal_cliente", tag: "Comercial", sortOrder: 5 },
    { slug: "finanzas_dte", name: "Finanzas + DTE", pricingModel: "flat", priceAmount: 10, priceUnit: "mes", moduleKey: "finanzas", tag: "Financiero", sortOrder: 6 },
    { slug: "payroll", name: "Payroll / Nómina", pricingModel: "per_guard", priceAmount: 0.10, priceUnit: "guardia/mes", moduleKey: "payroll", tag: "Financiero", sortOrder: 7 },
    { slug: "face_id", name: "Face ID Biométrico", pricingModel: "per_guard", priceAmount: 0.12, priceUnit: "guardia/mes", moduleKey: "face_id", tag: "Premium", sortOrder: 8 },
    { slug: "ia_operacional", name: "IA Operacional", pricingModel: "flat", priceAmount: 8, priceUnit: "mes", moduleKey: "ia_operacional", tag: "Premium", sortOrder: 9 },
    { slug: "control_acceso", name: "Control de Acceso", pricingModel: "per_unit", priceAmount: 5, priceUnit: "punto de acceso/mes", moduleKey: "control_acceso", tag: "Premium", sortOrder: 10 },
    { slug: "fiscalizacion_dt", name: "Fiscalización DT", pricingModel: "flat", priceAmount: 5, priceUnit: "mes", moduleKey: "fiscalizacion", tag: "Premium", sortOrder: 11 },
    { slug: "white_label", name: "White-label", pricingModel: "flat", priceAmount: 15, priceUnit: "mes", moduleKey: "white_label", tag: "Premium", sortOrder: 12 },
    { slug: "app_nativa", name: "App iOS/Android", pricingModel: "flat", priceAmount: 10, priceUnit: "mes", moduleKey: "app_nativa", tag: "Premium", sortOrder: 13 },
    { slug: "ats", name: "ATS / Reclutamiento", pricingModel: "flat", priceAmount: 5, priceUnit: "mes", moduleKey: "ats", tag: "Comercial", sortOrder: 14, description: "Publicación automática en Google Empleos, Indeed, base OPAI" },
    { slug: "psych", name: "Evaluación Psicolaboral", pricingModel: "flat", priceAmount: 0, priceUnit: "mes", moduleKey: "psych", tag: "RRHH", sortOrder: 15, description: "Tests psicolaborales para guardias con link firmado, scoring automático, análisis IA de preguntas abiertas e informe PDF. Complemento al OS-10." },
  ];

  for (const a of addons) {
    await prisma.addonCatalog.upsert({
      where: { slug: a.slug },
      update: { name: a.name, priceAmount: a.priceAmount, moduleKey: a.moduleKey },
      create: a,
    });
  }
  console.log(`  ${addons.length} add-ons`);

  // Packs
  const packs = [
    { slug: "pack_operaciones", name: "Pack Operaciones", description: "Rondas GPS + Control Nocturno IA", addonSlugs: ["rondas_gps", "control_nocturno"], discountPct: 15 },
    { slug: "pack_comercial", name: "Pack Comercial", description: "CRM + CPQ + Portal Cliente", addonSlugs: ["crm", "cpq", "portal_cliente"], discountPct: 20 },
    { slug: "pack_finanzas", name: "Pack Finanzas", description: "Finanzas + DTE + Payroll", addonSlugs: ["finanzas_dte", "payroll"], discountPct: 15 },
    { slug: "pack_completo", name: "Pack Completo", description: "Todos los add-ons", addonSlugs: ["rondas_gps", "control_nocturno", "inventario", "crm", "cpq", "portal_cliente", "finanzas_dte", "payroll", "face_id", "ia_operacional", "control_acceso", "fiscalizacion_dt", "white_label", "app_nativa", "ats"], discountPct: 30 },
  ];

  for (const p of packs) {
    await prisma.packCatalog.upsert({
      where: { slug: p.slug },
      update: { name: p.name, discountPct: p.discountPct },
      create: p,
    });
  }
  console.log(`  ${packs.length} packs`);

  console.log('Pricing catalog seeded');
}
