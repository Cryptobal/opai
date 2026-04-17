/**
 * Seed: Contrato de Servicio de Seguridad v2 (Blindado)
 *
 * Ensambla 23 cláusulas blindadas desde scripts/seed-contract/*,
 * con lógica condicional UF/CLP/Polinomio.
 *
 * Uso: npx tsx scripts/seed-contract-template.ts <TENANT_ID> <CREATED_BY_USER_ID>
 */
import { PrismaClient } from "@prisma/client";
import { HEADER_NODES } from "./seed-contract/header";
import { CLAUSES_1_4 } from "./seed-contract/clauses-1-4";
import { CLAUSE_5_QUINTA } from "./seed-contract/clause-5-quinta";
import { CLAUSES_6_12 } from "./seed-contract/clauses-6-12";
import { CLAUSES_13_18 } from "./seed-contract/clauses-13-18";
import { CLAUSES_19_23 } from "./seed-contract/clauses-19-23";
import { FOOTER_NODES } from "./seed-contract/footer";

const TENANT_ID = process.argv[2];
const CREATED_BY = process.argv[3] || "system";

if (!TENANT_ID) {
  console.error("Usage: npx tsx scripts/seed-contract-template.ts <TENANT_ID> [CREATED_BY]");
  process.exit(1);
}

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

async function main() {
  const prisma = new PrismaClient();
  const existing = await prisma.docTemplate.findFirst({
    where: {
      tenantId: TENANT_ID,
      module: "crm",
      category: "contrato_servicio",
      name: "Contrato de Servicio de Seguridad",
    },
  });

  const description =
    "Contrato blindado de prestación de servicios de seguridad y vigilancia privada — 23 cláusulas con tokens dinámicos CPQ y lógica condicional UF/CLP/Polinomio.";

  if (existing) {
    console.log(`Template already exists: ${existing.id}. Updating content...`);
    await prisma.docTemplate.update({
      where: { id: existing.id },
      data: { content: TEMPLATE_CONTENT, tokensUsed: TOKENS_USED, description },
    });
    console.log(`Updated template ${existing.id}`);
  } else {
    const template = await prisma.docTemplate.create({
      data: {
        tenantId: TENANT_ID,
        name: "Contrato de Servicio de Seguridad",
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
    console.log(`Created template: ${template.id}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
