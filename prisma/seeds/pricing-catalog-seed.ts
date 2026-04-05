import type { PrismaClient } from '@prisma/client';

export async function seedPricingCatalog(prisma: PrismaClient) {
  console.log('📦 Seeding pricing catalog...');

  // Plans
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
      includedModules: ["ops_asistencia", "ops_pauta", "portal_guardia"],
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
      includedModules: ["ops_asistencia", "ops_pauta", "documentos", "portal_guardia", "portal_supervisor"],
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
        "crm", "ops_asistencia", "ops_pauta", "ops_rondas", "ops_supervision",
        "documentos", "portal_cliente", "portal_guardia", "portal_supervisor", "chat", "gamificacion"
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
        "crm", "cpq", "ops_asistencia", "ops_pauta", "ops_rondas", "ops_supervision",
        "ops_inventario", "documentos", "payroll", "finanzas", "portal_cliente",
        "portal_guardia", "portal_supervisor", "gamificacion", "chat", "fiscalizacion"
      ],
      trialDays: 30,
      sortOrder: 3,
      featured: false,
    },
  ];

  for (const p of plans) {
    await prisma.planCatalog.upsert({
      where: { slug: p.slug },
      update: { name: p.name, pricePerGuard: p.pricePerGuard, baseMinimum: p.baseMinimum },
      create: p,
    });
  }
  console.log(`  ✅ ${plans.length} plans`);

  // Add-ons
  const addons = [
    { slug: "rondas_gps", name: "Rondas GPS", pricingModel: "per_guard", priceAmount: 0.15, priceUnit: "guardia/mes", moduleKey: "ops_rondas", tag: "Operacional", sortOrder: 0 },
    { slug: "control_nocturno", name: "Control Nocturno IA", pricingModel: "per_guard", priceAmount: 0.10, priceUnit: "guardia/mes", moduleKey: null, tag: "Operacional", sortOrder: 1 },
    { slug: "inventario", name: "Inventario", pricingModel: "flat", priceAmount: 5, priceUnit: "mes", moduleKey: "ops_inventario", tag: "Operacional", sortOrder: 2 },
    { slug: "crm", name: "CRM Comercial", pricingModel: "flat", priceAmount: 8, priceUnit: "mes", moduleKey: "crm", tag: "Comercial", sortOrder: 3 },
    { slug: "cpq", name: "CPQ (Cotizador)", pricingModel: "flat", priceAmount: 5, priceUnit: "mes", moduleKey: "cpq", tag: "Comercial", sortOrder: 4 },
    { slug: "portal_cliente", name: "Portal Cliente", pricingModel: "per_unit", priceAmount: 3, priceUnit: "cliente activo/mes", moduleKey: "portal_cliente", tag: "Comercial", sortOrder: 5 },
    { slug: "finanzas_dte", name: "Finanzas + DTE", pricingModel: "flat", priceAmount: 10, priceUnit: "mes", moduleKey: "finanzas", tag: "Financiero", sortOrder: 6 },
    { slug: "payroll", name: "Payroll / Nómina", pricingModel: "per_guard", priceAmount: 0.10, priceUnit: "guardia/mes", moduleKey: "payroll", tag: "Financiero", sortOrder: 7 },
    { slug: "face_id", name: "Face ID Biométrico", pricingModel: "per_guard", priceAmount: 0.12, priceUnit: "guardia/mes", moduleKey: null, tag: "Premium", sortOrder: 8 },
    { slug: "ia_operacional", name: "IA Operacional", pricingModel: "flat", priceAmount: 8, priceUnit: "mes", moduleKey: null, tag: "Premium", sortOrder: 9 },
    { slug: "control_acceso", name: "Control de Acceso", pricingModel: "per_unit", priceAmount: 5, priceUnit: "punto de acceso/mes", moduleKey: null, tag: "Premium", sortOrder: 10 },
    { slug: "fiscalizacion_dt", name: "Fiscalización DT", pricingModel: "flat", priceAmount: 5, priceUnit: "mes", moduleKey: "fiscalizacion", tag: "Premium", sortOrder: 11 },
    { slug: "white_label", name: "White-label", pricingModel: "flat", priceAmount: 15, priceUnit: "mes", moduleKey: null, tag: "Premium", sortOrder: 12 },
    { slug: "app_nativa", name: "App iOS/Android", pricingModel: "flat", priceAmount: 10, priceUnit: "mes", moduleKey: null, tag: "Premium", sortOrder: 13 },
  ];

  for (const a of addons) {
    await prisma.addonCatalog.upsert({
      where: { slug: a.slug },
      update: { name: a.name, priceAmount: a.priceAmount },
      create: a,
    });
  }
  console.log(`  ✅ ${addons.length} add-ons`);

  // Packs
  const packs = [
    { slug: "pack_operaciones", name: "Pack Operaciones", description: "Rondas GPS + Control Nocturno IA", addonSlugs: ["rondas_gps", "control_nocturno"], discountPct: 15 },
    { slug: "pack_comercial", name: "Pack Comercial", description: "CRM + CPQ + Portal Cliente", addonSlugs: ["crm", "cpq", "portal_cliente"], discountPct: 20 },
    { slug: "pack_finanzas", name: "Pack Finanzas", description: "Finanzas + DTE + Payroll", addonSlugs: ["finanzas_dte", "payroll"], discountPct: 15 },
    { slug: "pack_completo", name: "Pack Completo", description: "Todos los add-ons", addonSlugs: ["rondas_gps", "control_nocturno", "inventario", "crm", "cpq", "portal_cliente", "finanzas_dte", "payroll", "face_id", "ia_operacional", "control_acceso", "fiscalizacion_dt", "white_label", "app_nativa"], discountPct: 30 },
  ];

  for (const p of packs) {
    await prisma.packCatalog.upsert({
      where: { slug: p.slug },
      update: { name: p.name, discountPct: p.discountPct },
      create: p,
    });
  }
  console.log(`  ✅ ${packs.length} packs`);

  console.log('✅ Pricing catalog seeded');
}
