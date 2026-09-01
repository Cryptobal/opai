/**
 * Diagnóstico (sin corrección) de correos personales duplicados por tenant (Art. 12 e).
 * Uso: npx tsx scripts/diagnostico-personal-email-duplicados.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const personas = await prisma.$queryRaw<
    Array<{ tenant_id: string; email: string; n: bigint }>
  >`
    SELECT tenant_id, lower(trim(personal_email)) AS email, count(*)::bigint AS n
    FROM ops.personas
    WHERE personal_email IS NOT NULL AND trim(personal_email) <> ''
    GROUP BY 1, 2
    HAVING count(*) > 1
    ORDER BY n DESC
    LIMIT 200
  `;

  const guardias = await prisma.$queryRaw<
    Array<{ tenant_id: string; email: string; n: bigint }>
  >`
    SELECT tenant_id, lower(trim(personal_email)) AS email, count(*)::bigint AS n
    FROM ops.guardias
    WHERE personal_email IS NOT NULL AND trim(personal_email) <> ''
    GROUP BY 1, 2
    HAVING count(*) > 1
    ORDER BY n DESC
    LIMIT 200
  `;

  console.log(JSON.stringify({ personas, guardias }, (_, v) =>
    typeof v === "bigint" ? Number(v) : v,
  ));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
