/**
 * CLI Script para crear un nuevo tenant
 *
 * Uso:
 *   npx tsx scripts/create-tenant.ts
 *
 * Variables de entorno requeridas:
 *   TENANT_NAME="Securitas Chile SpA"
 *   TENANT_SLUG="securitas-cl"
 *   TENANT_OWNER_NAME="Juan Pérez"
 *   TENANT_OWNER_EMAIL="juan@securitas.cl"
 *   TENANT_OWNER_PASSWORD="SecurePass123!"
 *   TENANT_PLAN="professional"         # trial | essential | professional | enterprise
 *   TENANT_RUT="76.111.222-3"          # Opcional
 *   TENANT_TRIAL_DAYS="30"             # Opcional, default 30
 */

import { provisionTenant } from "../src/lib/tenant-provisioning";

async function main() {
  const name = process.env.TENANT_NAME;
  const slug = process.env.TENANT_SLUG;
  const ownerName = process.env.TENANT_OWNER_NAME;
  const ownerEmail = process.env.TENANT_OWNER_EMAIL;
  const ownerPassword = process.env.TENANT_OWNER_PASSWORD;
  const plan = (process.env.TENANT_PLAN || "trial") as
    | "trial"
    | "essential"
    | "professional"
    | "enterprise";
  const companyRut = process.env.TENANT_RUT;
  const trialDays = parseInt(process.env.TENANT_TRIAL_DAYS || "30", 10);

  if (!name || !slug || !ownerName || !ownerEmail || !ownerPassword) {
    console.error("Missing required environment variables:");
    console.error(
      "  TENANT_NAME, TENANT_SLUG, TENANT_OWNER_NAME, TENANT_OWNER_EMAIL, TENANT_OWNER_PASSWORD",
    );
    console.error("");
    console.error("Example:");
    console.error(
      '  TENANT_NAME="Demo Security" TENANT_SLUG="demo" TENANT_OWNER_NAME="Admin" TENANT_OWNER_EMAIL="admin@demo.cl" TENANT_OWNER_PASSWORD="Demo2026!" TENANT_PLAN="professional" npx tsx scripts/create-tenant.ts',
    );
    process.exit(1);
  }

  try {
    const result = await provisionTenant({
      name,
      slug,
      ownerName,
      ownerEmail,
      ownerPassword,
      plan,
      companyRut,
      trialDays,
    });

    console.log("\nTenant created successfully!\n");
    console.log("  Tenant ID:", result.tenant.id);
    console.log("  Slug:", result.tenant.slug);
    console.log("  Admin:", result.admin.email);
    console.log("  Plan:", result.plan.plan);
    console.log(
      "  Trial ends:",
      result.plan.trialEndsAt?.toISOString() ?? "N/A",
    );
    console.log("  Modules:", result.modulesEnabled.join(", "));
    console.log("\n  Login URL: https://opai.cl/opai/login");
    console.log("  Email:", ownerEmail);
    console.log("  Password:", ownerPassword);
  } catch (error) {
    console.error("\nError creating tenant:", (error as Error).message);
    process.exit(1);
  }

  process.exit(0);
}

main();
