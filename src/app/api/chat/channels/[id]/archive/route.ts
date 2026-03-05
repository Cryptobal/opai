import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

// POST → archive this channel for the current user
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id: channelId } = await params;

  const channel = await prisma.chatChannel.findFirst({
    where: { id: channelId, tenantId: ctx.tenantId },
  });
  if (!channel) {
    return NextResponse.json({ success: false, error: "Canal no encontrado" }, { status: 404 });
  }

  await prisma.chatChannelArchive.upsert({
    where: { channelId_adminId: { channelId, adminId: ctx.userId } },
    create: { channelId, adminId: ctx.userId },
    update: { archivedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}

// DELETE → unarchive this channel for the current user
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id: channelId } = await params;

  await prisma.chatChannelArchive.deleteMany({
    where: { channelId, adminId: ctx.userId },
  });

  return NextResponse.json({ success: true });
}
