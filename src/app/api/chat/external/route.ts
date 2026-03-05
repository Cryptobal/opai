import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function POST(req: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const { accountId, contactIds, adminIds, name } = body as {
    accountId: string;
    contactIds: string[];
    adminIds?: string[];
    name?: string;
  };

  // Validate required fields
  if (!accountId || !contactIds?.length) {
    return NextResponse.json(
      { success: false, error: "accountId y al menos un contactId son requeridos" },
      { status: 400 }
    );
  }

  // Verify account belongs to tenant
  const account = await prisma.crmAccount.findFirst({
    where: { id: accountId, tenantId: ctx.tenantId },
    select: { id: true, name: true, status: true },
  });
  if (!account) {
    return NextResponse.json({ success: false, error: "Cuenta no encontrada" }, { status: 404 });
  }

  // Verify all contacts exist, belong to account, and have portal enabled
  const contacts = await prisma.crmContact.findMany({
    where: {
      id: { in: contactIds },
      accountId,
      portalEnabled: true,
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (contacts.length !== contactIds.length) {
    return NextResponse.json(
      { success: false, error: "Uno o más contactos no tienen portal activo o no pertenecen a la cuenta" },
      { status: 400 }
    );
  }

  // Build full participant set: contacts + requested admins + current user (always included)
  const allAdminIds = Array.from(new Set([ctx.userId, ...(adminIds ?? [])]));

  // Check idempotency: find existing EXTERNAL channel with same account and exact same participant set
  const existingChannels = await prisma.chatChannel.findMany({
    where: {
      tenantId: ctx.tenantId,
      channelType: "EXTERNAL",
      accountId,
      isActive: true,
    },
    include: { participants: true },
  });

  for (const ch of existingChannels) {
    const existingAdmins = ch.participants
      .filter((p) => p.participantType === "ADMIN")
      .map((p) => p.participantId)
      .sort();
    const existingContacts = ch.participants
      .filter((p) => p.participantType === "CONTACT")
      .map((p) => p.participantId)
      .sort();
    const sameAdmins =
      JSON.stringify(existingAdmins) === JSON.stringify([...allAdminIds].sort());
    const sameContacts =
      JSON.stringify(existingContacts) === JSON.stringify([...contactIds].sort());
    if (sameAdmins && sameContacts) {
      return NextResponse.json({ success: true, data: { channelId: ch.id, existed: true } });
    }
  }

  // Build channel name from first contact + account (if not provided)
  const channelName =
    name ??
    `${contacts[0].firstName} ${contacts[0].lastName} · ${account.name}`;

  // Create channel + participants in a transaction
  const channel = await prisma.$transaction(async (tx) => {
    const ch = await tx.chatChannel.create({
      data: {
        tenantId: ctx.tenantId,
        channelType: "EXTERNAL",
        accountId,
        name: channelName,
        isActive: true,
      },
    });

    const participantData = [
      ...allAdminIds.map((adminId) => ({
        channelId: ch.id,
        participantType: "ADMIN" as const,
        participantId: adminId,
      })),
      ...contactIds.map((contactId) => ({
        channelId: ch.id,
        participantType: "CONTACT" as const,
        participantId: contactId,
      })),
    ];

    await tx.chatChannelParticipant.createMany({ data: participantData });

    return ch;
  });

  return NextResponse.json({ success: true, data: { channelId: channel.id, existed: false } });
}
