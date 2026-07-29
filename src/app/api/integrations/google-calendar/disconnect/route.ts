import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DISCONNECT_ERROR = "Cuenta de Google Calendar desconectada por el usuario";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  let accountId: string | undefined;
  try {
    const body = (await request.json()) as { accountId?: string };
    accountId = body.accountId;
  } catch {
    // body vacío → desconectar la cuenta default (compat)
  }

  const account = accountId
    ? await prisma.googleCalendarAccount.findFirst({
        where: { id: accountId, tenantId, userId, status: "ACTIVE" },
      })
    : await prisma.googleCalendarAccount.findFirst({
        where: { tenantId, userId, status: "ACTIVE" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });

  if (!account) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.googleCalendarAccount.update({
      where: { id: account.id },
      data: { status: "REVOKED", isDefault: false },
    });

    await tx.calendarProviderLink.updateMany({
      where: {
        tenantId,
        provider: "google",
        providerAccountId: account.id,
        syncStatus: { notIn: ["CANCELLED"] },
      },
      data: {
        syncStatus: "ERROR",
        lastError: DISCONNECT_ERROR,
        lastSyncAt: new Date(),
      },
    });

    await tx.agendaEventLink.updateMany({
      where: {
        tenantId,
        calendarAccountId: account.id,
        syncStatus: { notIn: ["CANCELLED"] },
      },
      data: {
        syncStatus: "ERROR",
        lastError: DISCONNECT_ERROR,
        lastSyncAt: new Date(),
      },
    });

    if (account.isDefault) {
      const next = await tx.googleCalendarAccount.findFirst({
        where: { tenantId, userId, status: "ACTIVE" },
        orderBy: [{ sortIndex: "asc" }, { createdAt: "asc" }],
      });
      if (next) {
        await tx.googleCalendarAccount.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  });

  return NextResponse.json({ ok: true, accountId: account.id });
}
