/**
 * Backfill: ensure every tenant has the `certificado_os10` row in
 * `ops.tipos_doc_operacional` (capa = "guardia").
 *
 * Usage:  npx tsx prisma/scripts/backfill-certificado-os10.ts
 *
 * Requires DATABASE_URL pointing at the target environment (prod or staging).
 * Idempotent — for each tenant it will:
 *   - create the row if missing,
 *   - reactivate it (isActive=true) if it exists but is inactive,
 *   - leave it untouched otherwise.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CERTIFICADO_OS10 = {
  codigo: "certificado_os10",
  nombre: "Certificado OS-10",
  capa: "guardia",
  obligatorio: true,
  tieneVencimiento: false,
  diasAlerta: 0,
  normativa: "D.S. 867 Art.5",
  order: 22,
};

async function main() {
  console.log("🔍 Buscando todos los tenants…");
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true },
  });
  console.log(`   ${tenants.length} tenants encontrados\n`);

  let created = 0;
  let reactivated = 0;
  let untouched = 0;
  let errors = 0;

  for (const tenant of tenants) {
    try {
      const existing = await prisma.tipoDocOperacional.findUnique({
        where: {
          tenantId_codigo: {
            tenantId: tenant.id,
            codigo: CERTIFICADO_OS10.codigo,
          },
        },
      });

      if (!existing) {
        await prisma.tipoDocOperacional.create({
          data: {
            tenantId: tenant.id,
            ...CERTIFICADO_OS10,
          },
        });
        console.log(`   ✓ ${tenant.slug}: creado certificado_os10`);
        created += 1;
      } else if (!existing.isActive) {
        await prisma.tipoDocOperacional.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
        console.log(`   ↻ ${tenant.slug}: reactivado certificado_os10`);
        reactivated += 1;
      } else {
        untouched += 1;
      }
    } catch (err) {
      errors += 1;
      console.error(`   ✗ ${tenant.slug}: error`, err);
    }
  }

  console.log("\n📊 Resumen:");
  console.log(`   Creados:        ${created}`);
  console.log(`   Reactivados:    ${reactivated}`);
  console.log(`   Ya existían:    ${untouched}`);
  console.log(`   Errores:        ${errors}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
