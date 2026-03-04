/**
 * API Route: /api/chat/pusher/auth
 * POST — Pusher channel authorization for admin users.
 *        Verifies the channel belongs to the admin's tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { authorizePusherChannel } from "@/lib/chat";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.formData().catch(async () => {
      // Fallback to JSON if not form data (Pusher can send either)
      const json = await request.json().catch(() => ({}));
      return json;
    });

    let socketId: string;
    let channelName: string;

    if (body instanceof FormData) {
      socketId = (body.get("socket_id") as string) ?? "";
      channelName = (body.get("channel_name") as string) ?? "";
    } else {
      socketId = body.socket_id ?? "";
      channelName = body.channel_name ?? "";
    }

    if (!socketId || !channelName) {
      return NextResponse.json(
        { success: false, error: "socket_id y channel_name son requeridos" },
        { status: 400 }
      );
    }

    // Parse channelId from channel name (format: "presence-chat-{channelId}")
    const match = channelName.match(/^presence-chat-(.+)$/);
    if (!match) {
      return NextResponse.json(
        { success: false, error: "Formato de canal inválido" },
        { status: 400 }
      );
    }

    const channelId = match[1];

    // Verify channel exists and belongs to admin's tenant
    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: "Canal no encontrado" },
        { status: 403 }
      );
    }

    // Get admin name for presence data
    const admin = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });
    const userName = admin?.name ?? ctx.userEmail;

    // Authorize the Pusher channel
    const authResponse = authorizePusherChannel(socketId, channelName, {
      id: ctx.userId,
      name: userName,
      type: "admin",
    });

    return NextResponse.json(authResponse);
  } catch (err: any) {
    console.error("Error authorizing Pusher channel:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
