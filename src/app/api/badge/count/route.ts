import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, type AuthContext } from "@/lib/api-auth";
import { batchUnreadCounts } from "@/lib/chat";
import { computeBellUnreadCount } from "@/lib/notifications/bell-visibility";

export const dynamic = "force-dynamic";

type BadgeCounts = { chat: number; bell: number; total: number };

// Cache por usuario/instancia (60s): el cliente ya poll cada 60s pero además
// re-sincroniza en visibilitychange y mensajes del SW; esto dedupe esas ráfagas
// y baja la presión a la DB (varias queries por request).
const CACHE_TTL = 60_000;
const cache = new Map<string, { at: number; data: BadgeCounts }>();

async function computeCounts(ctx: AuthContext): Promise<BadgeCounts> {
  const { userId } = ctx;
  const senderType = "ADMIN";

  // Chat unreads — solo canales con read cursor, excluyendo MUTED/MENTIONS_ONLY.
  const cursors = await prisma.chatReadCursor.findMany({
    where: { readerType: senderType, readerId: userId },
    select: { channelId: true },
  });
  const channelIds = cursors.map((c) => c.channelId);

  let chat = 0;
  if (channelIds.length > 0) {
    const muted = await prisma.chatNotificationPreference.findMany({
      where: {
        channelId: { in: channelIds },
        userType: senderType,
        userId,
        preference: { in: ["MUTED", "MENTIONS_ONLY"] },
      },
      select: { channelId: true },
    });
    const mutedSet = new Set(muted.map((m) => m.channelId));
    const includeIds = channelIds.filter((id) => !mutedSet.has(id));
    if (includeIds.length > 0) {
      const counts = await batchUnreadCounts(includeIds, senderType, userId, true);
      for (const c of counts.values()) chat += c;
    }
  }

  const bell = await computeBellUnreadCount(ctx);
  return { chat, bell, total: chat + bell };
}

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const key = `${ctx.tenantId}:${ctx.userId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return NextResponse.json(hit.data);
  }

  const data = await computeCounts(ctx);
  if (cache.size > 5000) cache.clear(); // backstop anti-crecimiento
  cache.set(key, { at: Date.now(), data });
  return NextResponse.json(data);
}
