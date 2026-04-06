import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from '@/lib/require-module';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const modCheck = await requireTenantModule('crm');
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmEdit(ctx, "contacts");
  if (forbidden) return forbidden;

  const { id: contactId } = await params;

  // Fetch contact with account info
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId },
    include: {
      account: { select: { id: true, name: true, status: true, tenantId: true } },
    },
  });

  if (!contact || !contact.account || contact.account.tenantId !== ctx.tenantId) {
    return NextResponse.json(
      { success: false, error: "Contacto no encontrado" },
      { status: 404 }
    );
  }

  if (!contact.portalEnabled) {
    return NextResponse.json(
      { success: false, error: "El contacto no tiene acceso al portal activo" },
      { status: 400 }
    );
  }

  // Check if a channel already exists with this contact and current user
  const existingChannels = await prisma.chatChannel.findMany({
    where: {
      tenantId: ctx.tenantId,
      channelType: "EXTERNAL",
      accountId: contact.accountId,
      isActive: true,
    },
    include: { participants: true },
  });

  for (const ch of existingChannels) {
    const hasContact = ch.participants.some(
      (p) => p.participantType === "CONTACT" && p.participantId === contactId
    );
    const hasMe = ch.participants.some(
      (p) => p.participantType === "ADMIN" && p.participantId === ctx.userId
    );
    // Return any channel that includes both this contact and the current user
    if (hasContact && hasMe) {
      return NextResponse.json({
        success: true,
        data: { channelId: ch.id, existed: true },
      });
    }
  }

  // Create a new 1:1 channel
  const channelName = `${contact.firstName} ${contact.lastName} · ${contact.account.name}`;

  const channel = await prisma.$transaction(async (tx) => {
    const ch = await tx.chatChannel.create({
      data: {
        tenantId: ctx.tenantId,
        channelType: "EXTERNAL",
        accountId: contact.accountId,
        name: channelName,
        isActive: true,
      },
    });

    await tx.chatChannelParticipant.createMany({
      data: [
        { channelId: ch.id, participantType: "ADMIN", participantId: ctx.userId },
        { channelId: ch.id, participantType: "CONTACT", participantId: contactId },
      ],
    });

    return ch;
  });

  return NextResponse.json({
    success: true,
    data: { channelId: channel.id, existed: false },
  });
}
