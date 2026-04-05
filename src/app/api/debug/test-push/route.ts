/**
 * Debug endpoint — Send a test push notification to the current user's subscriptions.
 *
 * POST /api/debug/test-push
 *
 * Requires authentication. Finds all active ChatPushSubscription records for the
 * current admin user, sends a test notification via web-push, and returns per-endpoint
 * status so you can verify the pipeline end-to-end.
 */

import { NextResponse } from "next/server";
import webPush from "web-push";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function POST() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json(
      { success: false, error: "VAPID keys not configured" },
      { status: 500 },
    );
  }

  webPush.setVapidDetails(
    "mailto:soporte@opai.cl",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const subscriptions = await prisma.chatPushSubscription.findMany({
    where: {
      tenantId: ctx.tenantId,
      subscriberType: "ADMIN",
      subscriberId: ctx.userId,
      isActive: true,
    },
  });

  if (subscriptions.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No active push subscriptions found for this user",
      subscriptionCount: 0,
      results: [],
    });
  }

  const payload = JSON.stringify({
    title: "🔔 Test Push Notification",
    body: `This is a test push sent at ${new Date().toLocaleTimeString("es-CL")}`,
    icon: "/icons/icon-192x192.png",
    badge: "/iconos_azul/icon-72x72.png",
    tag: "debug-test",
    renotify: true,
    timestamp: Date.now(),
    data: {
      url: "/chat",
      type: "debug_test",
      badgeCount: 0,
    },
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        return {
          endpoint: sub.endpoint.slice(0, 60) + "…",
          portalType: sub.portalType,
          status: "sent" as const,
        };
      } catch (error: unknown) {
        const err = error as { statusCode?: number; body?: string };
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.chatPushSubscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          });
        }
        return {
          endpoint: sub.endpoint.slice(0, 60) + "…",
          portalType: sub.portalType,
          status: "failed" as const,
          statusCode: err.statusCode,
          error: err.body || String(error),
        };
      }
    }),
  );

  const formatted = results.map((r) =>
    r.status === "fulfilled" ? r.value : { status: "error", error: String(r.reason) },
  );

  return NextResponse.json({
    success: true,
    subscriptionCount: subscriptions.length,
    results: formatted,
  });
}
