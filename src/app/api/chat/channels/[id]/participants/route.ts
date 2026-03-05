import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import type { ChatParticipantType } from "@prisma/client";

// POST → add participant to EXTERNAL channel
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id: channelId } = await params;
  const { participantType, participantId } = await req.json() as {
    participantType: ChatParticipantType;
    participantId: string;
  };

  const channel = await prisma.chatChannel.findFirst({
    where: { id: channelId, tenantId: ctx.tenantId, channelType: "EXTERNAL" },
    include: { participants: true },
  });
  if (!channel) {
    return NextResponse.json({ success: false, error: "Canal no encontrado" }, { status: 404 });
  }

  // Regular users can only add to channels they already participate in
  const isParticipant = channel.participants.some(
    (p) => p.participantType === "ADMIN" && p.participantId === ctx.userId
  );
  if (!isParticipant && ctx.userRole !== "admin" && ctx.userRole !== "owner") {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  await prisma.chatChannelParticipant.upsert({
    where: {
      channelId_participantType_participantId: {
        channelId,
        participantType,
        participantId,
      },
    },
    create: { channelId, participantType, participantId },
    update: {},
  });

  return NextResponse.json({ success: true });
}

// DELETE → remove participant (admin/owner only)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  if (ctx.userRole !== "admin" && ctx.userRole !== "owner") {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  const { id: channelId } = await params;
  const url = new URL(req.url);
  const participantType = url.searchParams.get("participantType") as ChatParticipantType;
  const participantId = url.searchParams.get("participantId") ?? "";

  if (!participantType || !participantId) {
    return NextResponse.json({ success: false, error: "participantType y participantId son requeridos" }, { status: 400 });
  }

  // Verify channel belongs to tenant before mutating
  const channel = await prisma.chatChannel.findFirst({
    where: { id: channelId, tenantId: ctx.tenantId },
  });
  if (!channel) {
    return NextResponse.json({ success: false, error: "Canal no encontrado" }, { status: 404 });
  }

  await prisma.chatChannelParticipant.deleteMany({
    where: { channelId, participantType, participantId },
  });

  return NextResponse.json({ success: true });
}
