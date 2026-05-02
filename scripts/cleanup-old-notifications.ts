import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cutoffDays = parseInt(process.env.CLEANUP_DAYS ?? "90", 10);
  const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);

  console.log(`Eliminando notificaciones anteriores a ${cutoff.toISOString()} (${cutoffDays} días)...`);

  const oldIds = await prisma.notification.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    take: 50000,
  });

  if (oldIds.length === 0) {
    console.log("No hay notificaciones antiguas para borrar.");
    return;
  }

  console.log(`Encontradas ${oldIds.length} notificaciones para borrar.`);

  const ids = oldIds.map((n) => n.id);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 5000) {
    const batch = ids.slice(i, i + 5000);
    await prisma.notificationReadState.deleteMany({
      where: { notificationId: { in: batch } },
    });
    const r = await prisma.notification.deleteMany({
      where: { id: { in: batch } },
    });
    deleted += r.count;
    console.log(`Batch ${i / 5000 + 1}: borradas ${r.count}, acumulado ${deleted}`);
  }

  console.log(`Total borradas: ${deleted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
