/**
 * API Route: /api/portal/cliente/chat/channels/[id]/read
 * POST — Update read cursor for the client user.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyClientChannelAccess } from "@/lib/portal-chat-auth";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { syncBadgeAcrossDevices } from "@/lib/pwa/push-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id: channelId } = await params;

    // Verify client has access to this channel
    const hasAccess = await verifyClientChannelAccess(session.accountId, channelId, session.contactId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: "Canal no encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const lastReadMessageId =
      typeof body.lastReadMessageId === "string" && UUID_RE.test(body.lastReadMessageId)
        ? body.lastReadMessageId
        : null;

    // Determine the lastReadAt timestamp
    let lastReadAt = new Date();

    if (lastReadMessageId) {
      const msg = await prisma.chatMessage.findFirst({
        where: { id: lastReadMessageId, channelId },
        select: { createdAt: true },
      });
      if (msg) {
        lastReadAt = msg.createdAt;
      }
    }

    // Upsert the read cursor
    const cursor = await prisma.chatReadCursor.upsert({
      where: {
        channelId_readerType_readerId: {
          channelId,
          readerType: "CLIENT",
          readerId: session.contactId,
        },
      },
      create: {
        tenantId: session.tenantId,
        channelId,
        readerType: "CLIENT",
        readerId: session.contactId,
        lastReadAt,
        lastReadMessageId,
      },
      update: {
        lastReadAt,
        lastReadMessageId,
      },
    });

    // Sync badge to other devices in the background (fire-and-forget)
    syncBadgeAcrossDevices(session.tenantId, 'contact', session.contactId).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        channelId: cursor.channelId,
        lastReadAt: cursor.lastReadAt.toISOString(),
        lastReadMessageId: cursor.lastReadMessageId,
      },
    });
  } catch (err: any) {
    console.error("[Portal Cliente] Error updating read cursor:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
