/**
 * Elimina TODAS las visitas técnicas en estado borrador.
 * Ejecutar una vez para limpiar borradores huérfanos.
 *
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/delete-visitas-borrador.ts
 * O: npx tsx scripts/delete-visitas-borrador.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.opsVisitaTecnica.deleteMany({
    where: { status: "borrador" },
  });
  console.log(`Eliminadas ${result.count} visitas técnicas en borrador.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
