import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { UNIFIED_NOTIFICATION_TYPES } from "@/lib/notifications/catalog";
import type { ChannelPrefs } from "@/lib/notifications/channel-types";

type PrefsMap = Record<string, ChannelPrefs>;

const VALID_KEYS = new Set(UNIFIED_NOTIFICATION_TYPES.map((t) => t.key));

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = (await req.json().catch(() => ({}))) as { type?: string };
    const type = typeof body.type === 'string' ? body.type : '';
    if (!type || !VALID_KEYS.has(type)) {
      return NextResponse.json(
        { success: false, error: 'Tipo de notificación inválido' },
        { status: 400 },
      );
    }

    const existing = await prisma.notificationPreference.findUnique({
      where: {
        subscriberType_subscriberId: { subscriberType: 'ADMIN', subscriberId: ctx.userId },
      },
    });
    const current = (existing?.preferences as PrefsMap | null) ?? {};
    const merged: PrefsMap = {
      ...current,
      [type]: { bell: false, email: false, pushDesktop: false, pushMobile: false },
    };

    await prisma.notificationPreference.upsert({
      where: {
        subscriberType_subscriberId: { subscriberType: 'ADMIN', subscriberId: ctx.userId },
      },
      update: { preferences: merged as object },
      create: {
        tenantId: ctx.tenantId,
        subscriberType: 'ADMIN',
        subscriberId: ctx.userId,
        preferences: merged as object,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[notif-prefs/quick-mute] error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al silenciar' },
      { status: 500 },
    );
  }
}
