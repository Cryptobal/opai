/**
 * Habilita el módulo `psych` para un tenant específico.
 *
 * También hace upsert del addon en AddonCatalog para que aparezca en
 * `TenantAddonsSection` (UI de /platform/tenants/[id]).
 *
 * Uso:
 *   TENANT_ID=clgard00000000000000001 npx tsx scripts/psych/enable-for-tenant.ts
 *
 * O contra Vercel/Prod (con DATABASE_URL de prod):
 *   DATABASE_URL="..." TENANT_ID="..." npx tsx scripts/psych/enable-for-tenant.ts
 *
 * Idempotente.
 */

import { PrismaClient } from "@prisma/client";
import { clearTenantModuleCache } from "@/lib/tenant-modules";

const prisma = new PrismaClient();

async function main() {
  const tenantId = process.env.TENANT_ID;
  if (!tenantId) {
    console.error("❌ Falta TENANT_ID (ej: TENANT_ID=clgard... npx tsx ...)");
    process.exitCode = 1;
    return;
  }

  console.log(`🔧 Habilitando módulo psych para tenant ${tenantId}`);

  // 1. Upsert del addon en el catálogo (para que aparezca en el UI).
  const addon = await prisma.addonCatalog.upsert({
    where: { slug: "psych" },
    create: {
      slug: "psych",
      name: "Evaluación Psicolaboral",
      description:
        "Tests psicolaborales para guardias con link firmado, scoring automático, análisis IA de preguntas abiertas e informe PDF. Complemento al OS-10.",
      pricingModel: "flat",
      priceAmount: 0,
      priceUnit: "mes",
      moduleKey: "psych",
      tag: "RRHH",
      sortOrder: 15,
      active: true,
    },
    update: {
      name: "Evaluación Psicolaboral",
      moduleKey: "psych",
      active: true,
    },
  });
  console.log(`  ✔ addon_catalog.psych (id=${addon.id})`);

  // 2. Verificar que el tenant existe.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    console.error(`❌ Tenant ${tenantId} no encontrado`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ✔ tenant: ${tenant.name} (${tenant.slug})`);

  // 3. Upsert de TenantModule (habilita el módulo).
  await prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId, module: "psych" } },
    create: { tenantId, module: "psych", enabled: true },
    update: { enabled: true },
  });
  console.log(`  ✔ tenant_modules.psych enabled`);

  // 4. Invalidar el cache (5 min TTL).
  clearTenantModuleCache(tenantId);
  console.log(`  ✔ cache invalidado`);

  console.log("");
  console.log("✅ Listo. El tenant ya puede acceder a /personas/psicolaboral");
  console.log(
    "   Si la UI de /platform/tenants/[id] no lo muestra todavía, recarga la página.",
  );
}

main()
  .catch((err) => {
    console.error("❌ FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
