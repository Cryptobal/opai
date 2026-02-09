/**
 * Corrige tenant_id de datos migrados desde Soho.
 * La migración guardó tenant_id = 'gard' (slug) pero la app usa el id real del tenant (CUID).
 * Ejecutar una vez: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/fix-tenant-id-soho.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'gard', active: true },
  });
  if (!tenant) {
    console.error('❌ No se encontró tenant con slug "gard"');
    process.exit(1);
  }

  const realId = tenant.id;
  console.log('Tenant "gard" id real:', realId);

  await prisma.crmAccount.updateMany({ where: { tenantId: 'gard' }, data: { tenantId: realId } });
  await prisma.crmContact.updateMany({ where: { tenantId: 'gard' }, data: { tenantId: realId } });

  // Negocios referencian etapas con tenant_id = 'gard'. Reasignar a etapas del tenant real (por nombre) y luego actualizar tenant_id.
  const stagesGard = await prisma.crmPipelineStage.findMany({ where: { tenantId: 'gard' } });
  const stagesReal = await prisma.crmPipelineStage.findMany({ where: { tenantId: realId } });
  const nameToRealId = new Map(stagesReal.map((s) => [s.name, s.id]));

  for (const g of stagesGard) {
    const realStageId = nameToRealId.get(g.name);
    if (realStageId) {
      await prisma.crmDeal.updateMany({ where: { stageId: g.id }, data: { stageId: realStageId } });
    }
  }
  await prisma.crmDeal.updateMany({ where: { tenantId: 'gard' }, data: { tenantId: realId } });
  await prisma.crmPipelineStage.deleteMany({ where: { tenantId: 'gard' } });

  const a = await prisma.crmAccount.count({ where: { tenantId: realId } });
  const c = await prisma.crmContact.count({ where: { tenantId: realId } });
  const d = await prisma.crmDeal.count({ where: { tenantId: realId } });

  console.log('✅ Cuentas con tenant corregido:', a);
  console.log('✅ Contactos con tenant corregido:', c);
  console.log('✅ Negocios con tenant corregido:', d);
  console.log('✅ Etapas "gard" eliminadas; negocios apuntan a etapas del tenant.');
  console.log('\n🎉 Listo. Recarga el CRM en local o producción.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
