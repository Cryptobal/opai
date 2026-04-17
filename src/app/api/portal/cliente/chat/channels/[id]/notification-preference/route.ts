/**
 * API Route: /api/portal/cliente/chat/channels/[id]/notification-preference
 * GET — Get notification preference for client contact on this channel.
 * PUT — Update notification preference.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

const VALID_PREFERENCES = ["ALL", "MENTIONS_ONLY", "MUTED"] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { id: channelId } = await params;

    const pref = await prisma.chatNotificationPreference.findFirst({
      where: {
        channelId,
        userType: "CLIENT",
        userId: session.contactId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { preference: pref?.preference ?? "ALL" },
    });
  } catch (err: any) {
    console.error("[Portal Cliente] Error getting notification preference:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePortalClienteAuth(request);
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
          userType: "CLIENT",
          userId: session.contactId,
        },
      },
      create: {
        tenantId: session.tenantId,
        channelId,
        userType: "CLIENT",
        userId: session.contactId,
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
    console.error("[Portal Cliente] Error updating notification preference:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
