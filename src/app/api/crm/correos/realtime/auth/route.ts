import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authorizePrivateChannel } from "@/lib/chat";
import { requireTenantModule } from "@/lib/require-module";
import { gmailMailboxChannel } from "@/modules/crm/email/gmail-realtime";

export async function POST(request: NextRequest) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.formData();
  const socketId = String(body.get("socket_id") ?? "");
  const channelName = String(body.get("channel_name") ?? "");
  if (!socketId || !channelName) {
    return NextResponse.json(
      { error: "socket_id y channel_name son requeridos" },
      { status: 400 },
    );
  }

  const expected = gmailMailboxChannel(
    session.user.tenantId,
    session.user.id,
  );
  if (channelName !== expected) {
    return NextResponse.json({ error: "Canal no autorizado" }, { status: 403 });
  }

  return NextResponse.json(authorizePrivateChannel(socketId, channelName));
}
