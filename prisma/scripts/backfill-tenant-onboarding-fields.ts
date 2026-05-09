/**
 * Backfill: copia datos de Settings (key-value) hacia los nuevos campos
 * top-level del Tenant agregados en migration b1.
 *
 * Idempotente: solo escribe campos NULL en Tenant. No sobreescribe.
 *
 * Uso: npx tsx prisma/scripts/backfill-tenant-onboarding-fields.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      slug: true,
      legalName: true,
      companyRut: true,
      industry: true,
    },
  });

  let updated = 0;
  for (const t of tenants) {
    if (t.legalName && t.companyRut && t.industry) {
      console.log(`[skip] ${t.slug}: ya tiene los 3 campos`);
      continue;
    }

    const settings = await prisma.setting.findMany({
      where: {
        tenantId: t.id,
        key: {
          in: [
            `empresa:${t.id}:empresa.razonSocial`,
            `empresa:${t.id}:empresa.rut`,
            `empresa:${t.id}:empresa.industry`,
            // Fallback a las keys legacy sin prefix
            `empresa.razonSocial`,
            `empresa.rut`,
            `empresa.industry`,
          ],
        },
      },
    });

    const map = new Map(
      settings.map((s) => [s.key.split(":").pop() ?? s.key, s.value]),
    );

    const data: { legalName?: string; companyRut?: string; industry?: string } = {};
    if (!t.legalName && map.get("empresa.razonSocial")) {
      data.legalName = map.get("empresa.razonSocial")!;
    }
    if (!t.companyRut && map.get("empresa.rut")) {
      data.companyRut = map.get("empresa.rut")!;
    }
    if (!t.industry && map.get("empresa.industry")) {
      data.industry = map.get("empresa.industry")!;
    }

    if (Object.keys(data).length > 0) {
      await prisma.tenant.update({ where: { id: t.id }, data });
      updated++;
      console.log(`[ok] ${t.slug}: ${Object.keys(data).join(", ")}`);
    }
  }

  console.log(
    `\nBackfill completado: ${updated}/${tenants.length} tenants actualizados.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
