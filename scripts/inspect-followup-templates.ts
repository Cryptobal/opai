/**
 * Imprime el contenido Tiptap JSON de las 3 plantillas de seguimiento
 * configuradas en el tenant (1er/2do/3er) para poder identificar los nodos
 * que contienen el link "Ver propuesta enviada" y decidir qué eliminar.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenantSlug = process.env.TENANT_SLUG?.trim() || "gard";
  const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug, active: true } });
  if (!tenant) {
    console.error("Tenant no encontrado:", tenantSlug);
    process.exit(1);
  }
  const cfg = await prisma.crmFollowUpConfig.findUnique({ where: { tenantId: tenant.id } });
  if (!cfg) {
    console.error("No hay crmFollowUpConfig para", tenantSlug);
    process.exit(1);
  }
  const ids = [
    { seq: 1, id: cfg.firstEmailTemplateId },
    { seq: 2, id: cfg.secondEmailTemplateId },
    { seq: 3, id: cfg.thirdEmailTemplateId },
  ];
  for (const { seq, id } of ids) {
    if (!id) {
      console.log(`\n=== Seq ${seq}: sin template configurado ===`);
      continue;
    }
    const t = await prisma.docTemplate.findUnique({ where: { id } });
    if (!t) {
      console.log(`\n=== Seq ${seq}: template ${id} no existe ===`);
      continue;
    }
    console.log(`\n=== Seq ${seq}: ${t.name} (${t.id}) ===`);
    console.log(JSON.stringify(t.content, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
