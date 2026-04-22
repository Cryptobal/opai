/**
 * Resincroniza chatChannel.lastMessagePreview / lastMessageAt / messageCount
 * con el estado real de chat.messages (solo mensajes no borrados, sin thread).
 *
 * Útil tras borrados antiguos que dejaron el preview stale.
 *
 * Dry-run por defecto:
 *   npx tsx scripts/resync-chat-channel-previews.ts
 *
 * Ejecutar de verdad:
 *   CONFIRM=1 npx tsx scripts/resync-chat-channel-previews.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function truncate(content: string, maxLen = 100): string {
  if (!content) return "";
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen - 1) + "…";
}

async function main() {
  const confirm = process.env.CONFIRM === "1";

  const channels = await prisma.chatChannel.findMany({
    select: {
      id: true,
      tenantId: true,
      name: true,
      lastMessagePreview: true,
      lastMessageAt: true,
      messageCount: true,
    },
  });

  let mismatches = 0;
  const updates: Array<{
    id: string;
    name: string;
    before: { preview: string | null; count: number };
    after: { preview: string | null; count: number };
  }> = [];

  for (const ch of channels) {
    const latest = await prisma.chatMessage.findFirst({
      where: {
        channelId: ch.id,
        deletedAt: null,
        threadRootId: null,
      },
      orderBy: { createdAt: "desc" },
      select: { content: true, attachments: true, createdAt: true },
    });

    const actualCount = await prisma.chatMessage.count({
      where: { channelId: ch.id, deletedAt: null, threadRootId: null },
    });

    const nextPreview = latest
      ? truncate(latest.content || "[Archivo adjunto]", 100)
      : null;
    const nextLastMessageAt = latest?.createdAt ?? null;

    const previewStale =
      (ch.lastMessagePreview ?? null) !== (nextPreview ?? null);
    const dateStale =
      (ch.lastMessageAt?.getTime() ?? null) !==
      (nextLastMessageAt?.getTime() ?? null);
    const countStale = ch.messageCount !== actualCount;

    if (previewStale || dateStale || countStale) {
      mismatches++;
      updates.push({
        id: ch.id,
        name: ch.name,
        before: { preview: ch.lastMessagePreview, count: ch.messageCount },
        after: { preview: nextPreview, count: actualCount },
      });

      if (confirm) {
        await prisma.chatChannel.update({
          where: { id: ch.id },
          data: {
            lastMessagePreview: nextPreview,
            lastMessageAt: nextLastMessageAt,
            messageCount: actualCount,
          },
        });
      }
    }
  }

  console.log(`Revisados ${channels.length} canales. ${mismatches} con preview/fecha/count stale.`);
  for (const u of updates) {
    console.log(
      `  ${u.name}\n    antes: preview=${JSON.stringify(u.before.preview)}, count=${u.before.count}\n    después: preview=${JSON.stringify(u.after.preview)}, count=${u.after.count}`
    );
  }

  if (!confirm) {
    console.log("\nDRY-RUN. Ejecuta con CONFIRM=1 para aplicar.");
  } else {
    console.log("\nListo.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
