/**
 * API Route: /api/portal/guardia/chat/channels/[id]/notification-preference
 * GET — Get notification preference for guard on this channel.
 * PUT — Update notification preference.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGuardSession } from "@/lib/portal-chat-auth";

const VALID_PREFERENCES = ["ALL", "MENTIONS_ONLY", "MUTED"] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getGuardSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { id: channelId } = await params;

    const pref = await prisma.chatNotificationPreference.findFirst({
      where: {
        channelId,
        userType: "GUARD",
        userId: session.guardiaId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { preference: pref?.preference ?? "ALL" },
    });
  } catch (err: any) {
    console.error("[Portal Guardia] Error getting notification preference:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getGuardSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { id: channelId } = await params;
    const body = await request.json().catch(() => ({}));
    const preference = body.preference as string;

    if (!VALID_PREFERENCES.includes(preference as any)) {
      return NextResponse.json(
        { success: false, error: "preference debe ser ALL, MENTIONS_ONLY o MUTED" },
        { status: 400 }
      );
    }

    const pref = await prisma.chatNotificationPreference.upsert({
      where: {
        channelId_userType_userId: {
          channelId,
          userType: "GUARD",
          userId: session.guardiaId,
        },
      },
      create: {
        tenantId: session.tenantId,
        channelId,
        userType: "GUARD",
        userId: session.guardiaId,
        preference,
      },
      update: {
        preference,
      },
    });

    return NextResponse.json({
      success: true,
      data: { preference: pref.preference },
    });
  } catch (err: any) {
    console.error("[Portal Guardia] Error updating notification preference:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
