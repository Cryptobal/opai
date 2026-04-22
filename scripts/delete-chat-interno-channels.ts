/**
 * Elimina permanentemente todos los canales de chat INSTALLATION con subType="interno"
 * de todos los tenants. Los mensajes, read cursors, participantes y archivos
 * asociados se borran por cascada.
 *
 * Uso (dry-run por defecto):
 *   npx tsx scripts/delete-chat-interno-channels.ts
 *
 * Para ejecutar de verdad:
 *   CONFIRM=1 npx tsx scripts/delete-chat-interno-channels.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const confirm = process.env.CONFIRM === "1";

  const targets = await prisma.chatChannel.findMany({
    where: { channelType: "INSTALLATION", subType: "interno" },
    select: {
      id: true,
      tenantId: true,
      name: true,
      messageCount: true,
      isActive: true,
    },
  });

  console.log(`Encontrados ${targets.length} canales INSTALLATION/interno.`);
  for (const ch of targets) {
    console.log(
      `  [${ch.isActive ? "activo" : "inactivo"}] ${ch.name}  (tenant=${ch.tenantId}, msgs=${ch.messageCount})`
    );
  }

  if (!confirm) {
    console.log("\nDRY-RUN. Nada se borró. Ejecuta con CONFIRM=1 para eliminar.");
    return;
  }

  if (targets.length === 0) {
    console.log("Nada que borrar.");
    return;
  }

  const result = await prisma.chatChannel.deleteMany({
    where: { channelType: "INSTALLATION", subType: "interno" },
  });
  console.log(
    `\nEliminados ${result.count} canales. Mensajes, cursores, participantes y archivos asociados borrados por cascada.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
