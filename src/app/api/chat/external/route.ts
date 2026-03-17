import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await req.json();
    const { accountId, contactIds, adminIds, name } = body as {
      accountId: string;
      contactIds: string[];
      adminIds?: string[];
      name?: string;
    };

    const uniqueContactIds = [...new Set(contactIds ?? [])];

    if (!accountId || !uniqueContactIds.length) {
      return NextResponse.json(
        { success: false, error: "accountId y al menos un contactId son requeridos" },
        { status: 400 }
      );
    }

    const account = await prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
      select: { id: true, name: true, status: true },
    });
    if (!account) {
      return NextResponse.json({ success: false, error: "Cuenta no encontrada" }, { status: 404 });
    }

    const contacts = await prisma.crmContact.findMany({
      where: {
        id: { in: uniqueContactIds },
        accountId,
        portalEnabled: true,
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (contacts.length !== uniqueContactIds.length) {
      return NextResponse.json(
        { success: false, error: "Uno o más contactos no tienen portal activo o no pertenecen a la cuenta" },
        { status: 400 }
      );
    }

    const allAdminIds = Array.from(new Set([ctx.userId, ...(adminIds ?? [])]));

    if (adminIds && adminIds.length > 0) {
      const validAdmins = await prisma.admin.findMany({
        where: { id: { in: adminIds }, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (validAdmins.length !== new Set(adminIds).size) {
        return NextResponse.json(
          { success: false, error: "Uno o más administradores no pertenecen a este tenant" },
          { status: 400 }
        );
      }
    }

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
        JSON.stringify(existingContacts) === JSON.stringify([...uniqueContactIds].sort());
      if (sameAdmins && sameContacts) {
        return NextResponse.json({ success: true, data: { channelId: ch.id, existed: true } });
      }
    }

    const channelName =
      name ??
      `${contacts[0].firstName} ${contacts[0].lastName} · ${account.name}`;

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
        ...uniqueContactIds.map((contactId) => ({
          channelId: ch.id,
          participantType: "CONTACT" as const,
          participantId: contactId,
        })),
      ];

      await tx.chatChannelParticipant.createMany({ data: participantData });

      return ch;
    });

    return NextResponse.json({ success: true, data: { channelId: channel.id, existed: false } });
  } catch (err: any) {
    console.error("Error creating external chat channel:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
