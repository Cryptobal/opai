#!/usr/bin/env node
/**
 * Dry-run: lista AgendaEventLink de visitas técnicas con googleEventId.
 * NO borra eventos de Google. Requiere DATABASE_URL / DIRECT_DATABASE_URL.
 *
 * Uso: node scripts/list-visita-tecnica-google-links.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const links = await prisma.agendaEventLink.findMany({
    where: {
      sourceType: "visita_tecnica",
      googleEventId: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      sourceId: true,
      googleEventId: true,
      googleCalendarId: true,
      htmlLink: true,
      syncStatus: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log(
    JSON.stringify(
      {
        dryRun: true,
        count: links.length,
        note: "No se borran eventos de Google sin aprobación explícita.",
        links,
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
  .finally(() => prisma.$disconnect());
