/**
 * Repara el flag `chunks_indexed` inflado: mensajes marcados como indexados
 * que NO tienen filas en `crm.email_chunks` vuelven a `chunks_indexed = false`
 * para que la indexación incremental los reintente.
 *
 * Idempotente y reversible (solo baja el flag; nunca borra chunks).
 * DRY-RUN por defecto — pasar `--yes` para aplicar.
 *
 * Uso:
 *   npx tsx scripts/repair-email-chunks-flag.ts
 *   npx tsx scripts/repair-email-chunks-flag.ts --tenant <id>
 *   npx tsx scripts/repair-email-chunks-flag.ts --tenant <id> --account <uuid> --yes
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

function argValue(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const tenantFilter = argValue("tenant");
  const accountFilter = argValue("account");
  const confirmed = process.argv.includes("--yes");

  const whereExtra: Prisma.Sql[] = [];
  if (tenantFilter) whereExtra.push(Prisma.sql`m.tenant_id = ${tenantFilter}`);
  if (accountFilter) {
    whereExtra.push(Prisma.sql`m.email_account_id = ${accountFilter}::uuid`);
  }
  const extra =
    whereExtra.length > 0
      ? Prisma.sql` AND ${Prisma.join(whereExtra, " AND ")}`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ cnt: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS cnt
    FROM crm.email_messages m
    WHERE m.chunks_indexed = true
      AND m.is_draft = false
      AND NOT EXISTS (
        SELECT 1 FROM crm.email_chunks c WHERE c.message_id = m.id
      )
      ${extra}
  `);
  const affected = Number(rows[0]?.cnt ?? 0);

  console.log(
    `[repair-email-chunks-flag] Mensajes con chunks_indexed=true sin chunks reales: ${affected}` +
      (tenantFilter ? ` (tenant ${tenantFilter}` : "") +
      (accountFilter ? `${tenantFilter ? ", " : " ("}account ${accountFilter}` : "") +
      (tenantFilter || accountFilter ? ")" : "") +
      ".",
  );

  if (!confirmed) {
    console.log("[repair-email-chunks-flag] DRY-RUN: agregá --yes para resetear el flag.");
    return;
  }

  if (affected === 0) {
    console.log("[repair-email-chunks-flag] Nada que reparar.");
    return;
  }

  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE crm.email_messages m
    SET chunks_indexed = false
    WHERE m.chunks_indexed = true
      AND m.is_draft = false
      AND NOT EXISTS (
        SELECT 1 FROM crm.email_chunks c WHERE c.message_id = m.id
      )
      ${extra}
  `);

  console.log(`[repair-email-chunks-flag] LISTO: ${updated} filas con chunks_indexed=false.`);
}

main()
  .catch((err) => {
    console.error("[repair-email-chunks-flag] falló:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
