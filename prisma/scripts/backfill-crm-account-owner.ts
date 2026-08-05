/**
 * Backfill idempotente de CrmAccount.ownerId para cuentas sin dueño que tengan
 * negocios de licitación abiertos.
 *
 * Por defecto es dry-run (solo lista). No adivina owner: no hay regla
 * determinista de asignación comercial en el repo para licitaciones.
 *
 * Uso:
 *   npx tsx prisma/scripts/backfill-crm-account-owner.ts
 *   npx tsx prisma/scripts/backfill-crm-account-owner.ts --apply
 *
 * Ejecutar solo con autorización explícita de Carlos.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const accounts = await prisma.crmAccount.findMany({
    where: {
      ownerId: null,
      deals: {
        some: {
          isLicitacion: true,
          status: "open",
        },
      },
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      portalEjecutivoId: true,
      deals: {
        where: { isLicitacion: true, status: "open" },
        select: { id: true, title: true },
        take: 5,
      },
    },
    take: 500,
  });

  console.log(
    `[backfill-crm-account-owner] ${accounts.length} cuentas sin owner con licitación abierta`,
  );
  console.log(`[backfill-crm-account-owner] modo: ${apply ? "APPLY" : "DRY-RUN"}`);

  // Sin regla determinista: listar para asignación manual.
  // portalEjecutivoId es referencia opcional (no se aplica automáticamente).
  for (const a of accounts) {
    console.log(
      JSON.stringify({
        accountId: a.id,
        tenantId: a.tenantId,
        name: a.name,
        portalEjecutivoId: a.portalEjecutivoId,
        openLicitacionDeals: a.deals.map((d) => ({ id: d.id, title: d.title })),
        action: "manual_assign_required",
      }),
    );
  }

  if (apply) {
    console.log(
      "[backfill-crm-account-owner] No se aplicó ningún cambio: no hay regla determinista. Asigná ownerId manualmente o ampliá el script con una regla aprobada.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
