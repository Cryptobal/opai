/**
 * API Route: /api/chat/channels/[id]/notification-preference
 * GET — Get notification preference for current user on this channel.
 * PUT — Update notification preference.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';

const VALID_PREFERENCES = ["ALL", "MENTIONS_ONLY", "MUTED"] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: channelId } = await params;

    const pref = await prisma.chatNotificationPreference.findFirst({
      where: {
        channelId,
        userType: "ADMIN",
        userId: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { preference: pref?.preference ?? "ALL" },
    });
  } catch (err: any) {
    console.error("Error getting notification preference:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: channelId } = await params;
    const body = await request.json().catch(() => ({}));
    const preference = body.preference as string;

    if (!VALID_PREFERENCES.includes(preference as any)) {
      return NextResponse.json(
        { success: false, error: "preference debe ser ALL, MENTIONS_ONLY o MUTED" },
        { status: 400 }
      );
    }

    // Verify channel exists and belongs to tenant
    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: "Canal no encontrado" },
        { status: 404 }
      );
    }

    const pref = await prisma.chatNotificationPreference.upsert({
      where: {
        channelId_userType_userId: {
          channelId,
          userType: "ADMIN",
          userId: ctx.userId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        channelId,
        userType: "ADMIN",
        userId: ctx.userId,
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
    console.error("Error updating notification preference:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
