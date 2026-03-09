/**
 * API Route: /api/portal/guardia/chat/pusher/auth
 * POST — Pusher channel authorization for guard users.
 *        Verifies the guard has access to the channel.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGuardSession, verifyGuardChannelAccess } from "@/lib/portal-chat-auth";
import { authorizePusherChannel, authorizePrivateChannel } from "@/lib/chat";

export async function POST(request: NextRequest) {
  try {
    const session = getGuardSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

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

    // Handle private-user notification channels
    const privateUserMatch = channelName.match(
      /^private-user-(.+)-(ADMIN|GUARD|CLIENT)-(.+)$/
    );
    if (privateUserMatch) {
      const [, channelTenantId, , channelUserId] = privateUserMatch;
      if (channelTenantId === session.tenantId && channelUserId === session.guardiaId) {
        const authResponse = authorizePrivateChannel(socketId, channelName);
        return NextResponse.json(authResponse);
      }
      return NextResponse.json(
        { success: false, error: "No autorizado para este canal" },
        { status: 403 }
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

    // Verify guard has access to this channel
    const hasAccess = await verifyGuardChannelAccess(session.guardiaId, channelId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: "Canal no encontrado" },
        { status: 403 }
      );
    }

    // Authorize the Pusher channel
    const authResponse = authorizePusherChannel(socketId, channelName, {
      id: session.guardiaId,
      name: session.guardiaName,
      type: "guard",
    });

    return NextResponse.json(authResponse);
  } catch (err: any) {
    console.error("[Portal Guardia] Error authorizing Pusher channel:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
