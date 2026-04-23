/**
 * API Route: /api/portal/cliente/chat/pusher/auth
 * POST — Pusher channel authorization for client users.
 *        Verifies the client has access to the channel.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyClientChannelAccess } from "@/lib/portal-chat-auth";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { authorizePusherChannel, authorizePrivateChannel } from "@/lib/chat";

export async function POST(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
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
      if (channelTenantId === session.tenantId && channelUserId === session.contactId) {
        const authResponse = authorizePrivateChannel(socketId, channelName);
        return NextResponse.json(authResponse);
      }
      return NextResponse.json(
        { success: false, error: "No autorizado para este canal" },
        { status: 403 }
      );
    }

    // Handle portal-cliente realtime account channels: broadcast de rondas y
    // alertas filtrado por accountId para que el cliente reciba solo eventos
    // de su propia cuenta (multi-tenant safe).
    const portalAccountMatch = channelName.match(
      /^private-portal-cliente-account-(.+)$/
    );
    if (portalAccountMatch) {
      const [, channelAccountId] = portalAccountMatch;
      if (channelAccountId === session.accountId) {
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

    // Verify client has access to this channel
    const hasAccess = await verifyClientChannelAccess(session.accountId, channelId, session.contactId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: "Canal no encontrado" },
        { status: 403 }
      );
    }

    // Authorize the Pusher channel
    const authResponse = authorizePusherChannel(socketId, channelName, {
      id: session.contactId,
      name: session.contactName,
      type: "client",
    });

    return NextResponse.json(authResponse);
  } catch (err: any) {
    console.error("[Portal Cliente] Error authorizing Pusher channel:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
