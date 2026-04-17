/**
 * Instalador del template "Contrato de Servicio de Seguridad v2" (blindado)
 * para el tenant Gard.
 *
 * - Archiva el template legacy "Contrato Prestación Servicios de Vigilancia"
 * - Crea o actualiza "Contrato de Servicio de Seguridad" con las 23 cláusulas
 * - Deja isActive=true, isDefault=true
 *
 * Uso:
 *   npx tsx scripts/install-gard-contract-v2.ts <TENANT_SLUG> [CREATED_BY]
 */
import { PrismaClient } from "@prisma/client";
import { HEADER_NODES } from "./seed-contract/header";
import { CLAUSES_1_4 } from "./seed-contract/clauses-1-4";
import { CLAUSE_5_QUINTA } from "./seed-contract/clause-5-quinta";
import { CLAUSES_6_12 } from "./seed-contract/clauses-6-12";
import { CLAUSES_13_18 } from "./seed-contract/clauses-13-18";
import { CLAUSES_19_23 } from "./seed-contract/clauses-19-23";
import { FOOTER_NODES } from "./seed-contract/footer";

const TENANT_SLUG = process.argv[2];
const CREATED_BY = process.argv[3] ?? "system";

if (!TENANT_SLUG) {
  console.error("Usage: npx tsx scripts/install-gard-contract-v2.ts <TENANT_SLUG> [CREATED_BY]");
  process.exit(1);
}

const TEMPLATE_NAME = "Contrato de Servicio de Seguridad";
const LEGACY_NAME = "Contrato Prestación Servicios de Vigilancia";

const TEMPLATE_CONTENT = {
  type: "doc",
  content: [
    ...HEADER_NODES,
    ...CLAUSES_1_4,
    ...CLAUSE_5_QUINTA,
    ...CLAUSES_6_12,
    ...CLAUSES_13_18,
    ...CLAUSES_19_23,
    ...FOOTER_NODES,
  ],
};

const TOKENS_USED = [
  "empresa.razonSocial", "empresa.rut", "empresa.direccion", "empresa.comuna",
  "empresa.repLegalNombre", "empresa.repLegalRut",
  "account.legalName", "account.rut", "account.legalRepresentativeName",
  "account.legalRepresentativeRut", "account.address", "account.commune",
  "account.notaryName", "account.notaryDate",
  "installation.address", "installation.commune", "installation.city",
  "quote.dotacionResumen", "quote.precioNeto", "quote.precioUF",
  "quote.paymentDays", "quote.contractMonths", "quote.precioTotal",
  "quote.contractStartDate", "quote.contractEndDate",
  "quote.liabilityMonths", "quote.insurancePolicyUF",
  "quote.adjustmentFreq", "quote.adjustmentType",
  "quote.ipcWeight", "quote.imoWeight",
  "quote.cctvRetentionDays",
  "system.todayLong",
  "signature.signer_1", "signature.signer_2",
];

async function resolveTenantId(prisma: PrismaClient, slug: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    throw new Error(`Tenant con slug "${slug}" no existe`);
  }
  return tenant.id;
}

async function archiveLegacy(prisma: PrismaClient, tenantId: string) {
  const legacy = await prisma.docTemplate.findFirst({
    where: { tenantId, module: "crm", name: LEGACY_NAME },
  });
  if (!legacy) {
    console.log("  ✓ Legacy template no encontrado (ok, nada que archivar)");
    return;
  }
  await prisma.docTemplate.update({
    where: { id: legacy.id },
    data: {
      isActive: false,
      isDefault: false,
      description:
        (legacy.description ?? "") +
        " [ARCHIVADO " + new Date().toISOString().slice(0, 10) +
        " — reemplazado por Contrato de Servicio de Seguridad v2]",
    },
  });
  console.log(`  ✓ Legacy archivado (${legacy.id})`);
}

async function upsertTemplate(prisma: PrismaClient, tenantId: string) {
  const description =
    "Contrato blindado de prestación de servicios de seguridad y vigilancia privada — 23 cláusulas con tokens dinámicos CPQ y lógica condicional UF/CLP/Polinomio.";

  const existing = await prisma.docTemplate.findFirst({
    where: { tenantId, module: "crm", category: "contrato_servicio", name: TEMPLATE_NAME },
  });

  if (existing) {
    await prisma.docTemplate.update({
      where: { id: existing.id },
      data: {
        content: TEMPLATE_CONTENT,
        tokensUsed: TOKENS_USED,
        description,
        isActive: true,
        isDefault: true,
      },
    });
    console.log(`  ✓ Template actualizado (${existing.id})`);
    return existing.id;
  }

  const created = await prisma.docTemplate.create({
    data: {
      tenantId,
      name: TEMPLATE_NAME,
      description,
      content: TEMPLATE_CONTENT,
      module: "crm",
      category: "contrato_servicio",
      tokensUsed: TOKENS_USED,
      isActive: true,
      isDefault: true,
      createdBy: CREATED_BY,
    },
  });
  console.log(`  ✓ Template creado (${created.id})`);
  return created.id;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`\n→ Instalando contrato v2 para tenant "${TENANT_SLUG}"...`);
    const tenantId = await resolveTenantId(prisma, TENANT_SLUG);
    console.log(`  ✓ Tenant resuelto: ${tenantId}`);
    await archiveLegacy(prisma, tenantId);
    await upsertTemplate(prisma, tenantId);
    console.log("\n✅ Instalación completada.\n");
  } catch (e) {
    console.error("\n❌ Error:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
