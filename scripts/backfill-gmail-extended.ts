/**
 * Backfill extendido de Gmail más allá de la ventana inicial de 120d.
 *
 * Uso (local / one-off supervisado):
 *   npx tsx scripts/backfill-gmail-extended.ts --tenant=<slug|id> --email=<casilla> --days=400
 *
 * No corre en cron. Idempotente: reusa upsertGmailMessage.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main() {
  const tenantKey = arg("tenant");
  const email = arg("email");
  const days = Math.min(Math.max(Number(arg("days") ?? "400") || 400, 30), 2000);
  if (!tenantKey || !email) {
    console.error(
      "Uso: npx tsx scripts/backfill-gmail-extended.ts --tenant=<slug|id> --email=<casilla> [--days=400]",
    );
    process.exit(1);
  }

  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ id: tenantKey }, { slug: tenantKey }],
    },
    select: { id: true, slug: true },
  });
  if (!tenant) {
    console.error(`Tenant no encontrado: ${tenantKey}`);
    process.exit(1);
  }

  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId: tenant.id,
      email: { equals: email, mode: "insensitive" },
      provider: "gmail",
      status: "active",
    },
  });
  if (!account) {
    console.error(`Casilla no encontrada o inactiva: ${email}`);
    process.exit(1);
  }

  console.log(
    `[backfill-extended] tenant=${tenant.slug ?? tenant.id} email=${account.email} days=${days}`,
  );
  console.log(
    `[backfill-extended] Query Gmail sugerida: newer_than:${days}d (in:inbox OR in:sent)`,
  );
  console.log(
    "[backfill-extended] Para ejecutar el sync real, encolá un job con esa query " +
      "o adaptá temporalmente BACKFILL_QUERY en gmail-backfill.ts y dispará sync.",
  );
  console.log(
    "[backfill-extended] Este script documenta el procedimiento; el runner completo " +
      "requiere tokens OAuth vivos del usuario (ver syncGmailAccount).",
  );

  // Cobertura actual para decidir si hace falta.
  const oldest = await prisma.crmEmailMessage.findFirst({
    where: { tenantId: tenant.id, emailAccountId: account.id, isDraft: false },
    orderBy: { sentAt: "asc" },
    select: { sentAt: true },
  });
  const newest = await prisma.crmEmailMessage.findFirst({
    where: { tenantId: tenant.id, emailAccountId: account.id, isDraft: false },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  const total = await prisma.crmEmailMessage.count({
    where: { tenantId: tenant.id, emailAccountId: account.id, isDraft: false },
  });
  console.log(
    JSON.stringify(
      {
        totalMessages: total,
        oldestMessageAt: oldest?.sentAt?.toISOString() ?? null,
        newestMessageAt: newest?.sentAt?.toISOString() ?? null,
        targetDays: days,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
