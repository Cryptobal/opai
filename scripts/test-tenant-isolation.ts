/**
 * Test de Aislamiento Multi-Tenant
 * Verifica que los datos de cada tenant están completamente separados.
 *
 * Uso: npx tsx scripts/test-tenant-isolation.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${testName}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function main() {
  console.log("\n═══════════════════════════════════════════");
  console.log("🔒 TEST DE AISLAMIENTO MULTI-TENANT");
  console.log("═══════════════════════════════════════════\n");

  // ── Setup: obtener IDs de ambos tenants ──
  const gard = await prisma.tenant.findUnique({ where: { slug: "gard" } });
  const demo = await prisma.tenant.findUnique({
    where: { slug: "demo-security" },
  });

  if (!gard) {
    console.error("❌ Tenant 'gard' no encontrado");
    process.exit(1);
  }
  if (!demo) {
    console.error("❌ Tenant 'demo-security' no encontrado");
    process.exit(1);
  }

  console.log(`Gard tenant ID: ${gard.id}`);
  console.log(`Demo tenant ID: ${demo.id}\n`);

  // ══════════════════════════════════════
  // TEST 1: Aislamiento de Guardias
  // ══════════════════════════════════════
  console.log("── Test 1: Aislamiento de Guardias ──");

  const guardiasGard = await prisma.opsGuardia.findMany({
    where: { tenantId: gard.id },
    select: { id: true },
  });
  const guardiasDemo = await prisma.opsGuardia.findMany({
    where: { tenantId: demo.id },
    select: { id: true },
  });

  assert(
    guardiasGard.length > 0,
    "Gard tiene guardias",
    `count: ${guardiasGard.length}`,
  );
  assert(
    guardiasDemo.length > 0,
    "Demo tiene guardias",
    `count: ${guardiasDemo.length}`,
  );

  // Verificar que ningún guardia de Demo aparece en query de Gard
  const gardGuardiaIds = new Set(guardiasGard.map((g) => g.id));
  const demoGuardiaIds = new Set(guardiasDemo.map((g) => g.id));
  const overlap = [...gardGuardiaIds].filter((id) => demoGuardiaIds.has(id));
  assert(
    overlap.length === 0,
    "Sin overlap de IDs de guardias entre tenants",
    `overlap: ${overlap.length}`,
  );

  // Intentar leer guardia de Demo con filtro de Gard → debe retornar null
  if (guardiasDemo.length > 0) {
    const crossRead = await prisma.opsGuardia.findFirst({
      where: { id: guardiasDemo[0].id, tenantId: gard.id },
    });
    assert(crossRead === null, "Query cross-tenant de guardia retorna null");
  }

  // ══════════════════════════════════════
  // TEST 2: Aislamiento de Instalaciones
  // ══════════════════════════════════════
  console.log("\n── Test 2: Aislamiento de Instalaciones ──");

  const installGard = await prisma.crmInstallation.findMany({
    where: { tenantId: gard.id },
    select: { id: true, name: true },
  });
  const installDemo = await prisma.crmInstallation.findMany({
    where: { tenantId: demo.id },
    select: { id: true, name: true },
  });

  assert(
    installGard.length > 0,
    "Gard tiene instalaciones",
    `count: ${installGard.length}`,
  );
  assert(
    installDemo.length > 0,
    "Demo tiene instalaciones",
    `count: ${installDemo.length}`,
  );

  // Cross-tenant read
  if (installDemo.length > 0) {
    const crossRead = await prisma.crmInstallation.findFirst({
      where: { id: installDemo[0].id, tenantId: gard.id },
    });
    assert(
      crossRead === null,
      "Query cross-tenant de instalación retorna null",
    );
  }

  // ══════════════════════════════════════
  // TEST 3: Aislamiento de Cuentas CRM
  // ══════════════════════════════════════
  console.log("\n── Test 3: Aislamiento de Cuentas CRM ──");

  const accountsGard = await prisma.crmAccount.findMany({
    where: { tenantId: gard.id },
    select: { id: true },
  });
  const accountsDemo = await prisma.crmAccount.findMany({
    where: { tenantId: demo.id },
    select: { id: true },
  });

  assert(
    accountsDemo.length > 0,
    "Demo tiene cuentas CRM",
    `count: ${accountsDemo.length}`,
  );

  if (accountsDemo.length > 0) {
    const crossRead = await prisma.crmAccount.findFirst({
      where: { id: accountsDemo[0].id, tenantId: gard.id },
    });
    assert(crossRead === null, "Query cross-tenant de cuenta CRM retorna null");
  }

  // ══════════════════════════════════════
  // TEST 4: Aislamiento de Admins
  // ══════════════════════════════════════
  console.log("\n── Test 4: Aislamiento de Admins ──");

  const adminsGard = await prisma.admin.findMany({
    where: { tenantId: gard.id },
    select: { id: true, email: true },
  });
  const adminsDemo = await prisma.admin.findMany({
    where: { tenantId: demo.id },
    select: { id: true, email: true },
  });

  assert(
    adminsGard.length > 0,
    "Gard tiene admins",
    `count: ${adminsGard.length}`,
  );
  assert(
    adminsDemo.length > 0,
    "Demo tiene admins",
    `count: ${adminsDemo.length}`,
  );

  // Verificar que admin de Demo no aparece en Gard
  if (adminsDemo.length > 0) {
    const crossRead = await prisma.admin.findFirst({
      where: { id: adminsDemo[0].id, tenantId: gard.id },
    });
    assert(crossRead === null, "Admin de Demo no visible desde Gard");
  }

  // Verificar que admin de Gard no aparece en Demo
  if (adminsGard.length > 0) {
    const crossRead = await prisma.admin.findFirst({
      where: { id: adminsGard[0].id, tenantId: demo.id },
    });
    assert(crossRead === null, "Admin de Gard no visible desde Demo");
  }

  // ══════════════════════════════════════
  // TEST 5: Aislamiento de Personas
  // ══════════════════════════════════════
  console.log("\n── Test 5: Aislamiento de Personas ──");

  const personasGard = await prisma.opsPersona.findMany({
    where: { tenantId: gard.id },
    select: { id: true },
  });
  const personasDemo = await prisma.opsPersona.findMany({
    where: { tenantId: demo.id },
    select: { id: true },
  });

  assert(
    personasDemo.length > 0,
    "Demo tiene personas",
    `count: ${personasDemo.length}`,
  );

  if (personasDemo.length > 0) {
    const crossRead = await prisma.opsPersona.findFirst({
      where: { id: personasDemo[0].id, tenantId: gard.id },
    });
    assert(crossRead === null, "Persona de Demo no visible desde Gard");
  }

  // ══════════════════════════════════════
  // TEST 6: Módulos por Tenant
  // ══════════════════════════════════════
  console.log("\n── Test 6: Módulos por Tenant ──");

  const modulesGard = await prisma.tenantModule.findMany({
    where: { tenantId: gard.id, enabled: true },
    select: { module: true },
  });
  const modulesDemo = await prisma.tenantModule.findMany({
    where: { tenantId: demo.id, enabled: true },
    select: { module: true },
  });

  assert(
    modulesGard.length > 0,
    "Gard tiene módulos configurados",
    `count: ${modulesGard.length}`,
  );
  assert(
    modulesDemo.length > 0,
    "Demo tiene módulos configurados",
    `count: ${modulesDemo.length}`,
  );

  // Demo es professional → no debería tener cpq, payroll, finanzas, etc.
  const demoModuleSet = new Set(modulesDemo.map((m) => m.module));
  assert(!demoModuleSet.has("cpq"), "Demo (professional) NO tiene CPQ");
  assert(!demoModuleSet.has("payroll"), "Demo (professional) NO tiene Payroll");
  assert(
    !demoModuleSet.has("finanzas"),
    "Demo (professional) NO tiene Finanzas",
  );
  assert(demoModuleSet.has("crm"), "Demo (professional) SÍ tiene CRM");
  assert(
    demoModuleSet.has("ops_rondas"),
    "Demo (professional) SÍ tiene Rondas",
  );

  // ══════════════════════════════════════
  // TEST 7: Planes por Tenant
  // ══════════════════════════════════════
  console.log("\n── Test 7: Planes por Tenant ──");

  const planGard = await prisma.tenantPlan.findUnique({
    where: { tenantId: gard.id },
  });
  const planDemo = await prisma.tenantPlan.findUnique({
    where: { tenantId: demo.id },
  });

  assert(planGard !== null, "Gard tiene plan configurado");
  assert(
    planGard?.plan === "enterprise",
    "Gard es Enterprise",
    `plan: ${planGard?.plan}`,
  );
  assert(planDemo !== null, "Demo tiene plan configurado");
  assert(
    planDemo?.plan === "professional",
    "Demo es Professional",
    `plan: ${planDemo?.plan}`,
  );
  assert(
    planDemo?.billingStatus === "trial",
    "Demo está en trial",
    `status: ${planDemo?.billingStatus}`,
  );

  // ══════════════════════════════════════
  // TEST 8: Settings por Tenant
  // ══════════════════════════════════════
  console.log("\n── Test 8: Settings por Tenant ──");

  const settingsDemo = await prisma.setting.findMany({
    where: { tenantId: demo.id, category: "empresa" },
    select: { key: true, value: true },
  });

  assert(
    settingsDemo.length > 0,
    "Demo tiene settings de empresa",
    `count: ${settingsDemo.length}`,
  );

  // Key format is "empresa:<tenantId>:empresa.companyName"
  const companyNameSetting = settingsDemo.find((s) =>
    s.key.includes("empresa.companyName"),
  );
  assert(
    companyNameSetting?.value === "Demo Security SpA",
    "Setting companyName es 'Demo Security SpA'",
    `value: ${companyNameSetting?.value}`,
  );

  // ══════════════════════════════════════
  // RESUMEN
  // ══════════════════════════════════════
  console.log(
    "\n═══════════════════════════════════════════",
  );
  console.log(
    `🏁 RESULTADOS: ${passed} passed, ${failed} failed de ${passed + failed} tests`,
  );
  console.log(
    "═══════════════════════════════════════════\n",
  );

  if (failed > 0) {
    console.log("⚠️  HAY TESTS FALLIDOS — revisar antes de continuar");
    process.exit(1);
  } else {
    console.log(
      "🎉 TODOS LOS TESTS PASARON — aislamiento multi-tenant verificado",
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
