/**
 * Orquestador Gard v2:
 *   1. Archiva el template legacy "Contrato Prestación Servicios de Vigilancia"
 *   2. Siembra/reemplaza "Contrato de Servicio de Seguridad" con la v2 blindada
 *
 * Uso: npx tsx scripts/seed-gard-contract-v2.ts <TENANT_ID> <CREATED_BY>
 */
import { archiveLegacyContractTemplate } from "../prisma/seeds/seed-contract-template";

async function main() {
  const tenantId = process.argv[2];
  const createdBy = process.argv[3];
  if (!tenantId || !createdBy) {
    console.error("Usage: npx tsx scripts/seed-gard-contract-v2.ts <TENANT_ID> <CREATED_BY>");
    process.exit(1);
  }
  console.log(`Seeding Gard contract v2 for tenant ${tenantId}...`);
  await archiveLegacyContractTemplate(tenantId);
  const { execSync } = await import("node:child_process");
  execSync(
    `npx tsx scripts/seed-contract-template.ts ${tenantId} ${createdBy}`,
    { stdio: "inherit" }
  );
  console.log("✅ Done");
}

main().catch((e) => { console.error(e); process.exit(1); });
