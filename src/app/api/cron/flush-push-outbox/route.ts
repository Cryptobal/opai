import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import webPush from "web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let initialized = false;
function init() {
  if (initialized) return;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  webPush.setVapidDetails(
    "mailto:soporte@opai.cl",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  initialized = true;
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  init();
  const now = new Date();

  const due = await prisma.pushOutbox.findMany({
    where: { sentAt: null, scheduledFor: { lte: now } },
    take: 200,
  });

  let sent = 0;
  let failed = 0;

  for (const item of due) {
    try {
      const subs = await prisma.chatPushSubscription.findMany({
        where: {
          tenantId: item.tenantId,
          subscriberType: item.subscriberType as 'ADMIN' | 'GUARD' | 'CLIENT',
          subscriberId: item.subscriberId,
          isActive: true,
        },
      });
      const payload = JSON.stringify({
        title: item.title,
        body: item.body,
        icon: "/icons/icon-192x192.png",
        badge: "/iconos_azul/icon-72x72.png",
        tag: item.notifKey,
        renotify: true,
        timestamp: now.getTime(),
        data: {
          url: item.url ?? undefined,
          type: "system_notification",
          ...((item.data as Record<string, unknown> | null) ?? {}),
        },
      });

      await Promise.allSettled(
        subs.map((s) =>
          webPush
            .sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
            )
            .catch(async (err: unknown) => {
              const e = err as { statusCode?: number };
              if (e.statusCode === 410 || e.statusCode === 404) {
                await prisma.chatPushSubscription
                  .update({ where: { id: s.id }, data: { isActive: false } })
                  .catch(() => {});
              }
            }),
        ),
      );

      await prisma.pushOutbox.update({
        where: { id: item.id },
        data: { sentAt: now },
      });
      sent++;
    } catch (err) {
      failed++;
      console.error("[flush-push-outbox] failed", item.id, err);
    }
  }

  return NextResponse.json({ sent, failed, total: due.length });
}
