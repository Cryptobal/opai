import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  getCalendarClientForAccount,
  getCalendarClientForUser,
  listCalendarAccounts,
} from "@/lib/google-workspace";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;
  const isAdmin = ["owner", "admin"].includes(session.user.role ?? "");

  const accounts = await listCalendarAccounts(tenantId, session.user.id);
  const mine = accounts[0] ?? null;

  let team: Array<{
    userId: string;
    name: string;
    email: string;
    connected: boolean;
    accountCount: number;
  }> = [];
  if (isAdmin) {
    const users = await prisma.admin.findMany({
      where: { tenantId, status: "active" },
      select: { id: true, name: true, email: true },
      take: 100,
    });
    const allAccounts = await prisma.googleCalendarAccount.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { userId: true },
    });
    const countByUser = new Map<string, number>();
    for (const a of allAccounts) {
      countByUser.set(a.userId, (countByUser.get(a.userId) ?? 0) + 1);
    }
    team = users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      connected: (countByUser.get(u.id) ?? 0) > 0,
      accountCount: countByUser.get(u.id) ?? 0,
    }));
  }

  return NextResponse.json({
    connected: accounts.length > 0,
    googleEmail: mine?.googleEmail ?? null,
    calendarId: mine?.calendarId ?? "primary",
    prefs: {},
    accounts: accounts.map((a) => ({
      id: a.id,
      googleEmail: a.googleEmail,
      isDefault: a.isDefault,
      color: a.color,
      calendarId: a.calendarId,
      status: a.status,
      sortIndex: a.sortIndex,
    })),
    team,
  });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    accountId?: string;
    calendarId?: string;
    prefs?: Record<string, unknown>;
    createDedicated?: boolean;
    isDefault?: boolean;
    color?: string;
  };

  const account = body.accountId
    ? await prisma.googleCalendarAccount.findFirst({
        where: {
          id: body.accountId,
          tenantId: session.user.tenantId,
          userId: session.user.id,
          status: "ACTIVE",
        },
      })
    : await prisma.googleCalendarAccount.findFirst({
        where: {
          tenantId: session.user.tenantId,
          userId: session.user.id,
          status: "ACTIVE",
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });
  if (!account) {
    return NextResponse.json({ error: "Calendar no conectado" }, { status: 400 });
  }

  let calendarId = body.calendarId ?? account.calendarId;
  if (body.createDedicated) {
    const client = body.accountId
      ? await getCalendarClientForAccount(session.user.tenantId, account.id)
      : await getCalendarClientForUser(session.user.tenantId, session.user.id);
    if (client) {
      try {
        const created = await client.calendar.calendars.insert({
          requestBody: { summary: "Opai · Visitas" },
        });
        if (created.data.id) calendarId = created.data.id;
      } catch (err) {
        console.warn("[google-calendar] createDedicated failed:", err);
      }
    }
  }

  const prefs = {
    ...(typeof account.prefs === "object" && account.prefs && !Array.isArray(account.prefs)
      ? (account.prefs as Record<string, unknown>)
      : {}),
    ...(body.prefs ?? {}),
  } as Prisma.InputJsonValue;

  if (body.isDefault === true) {
    await prisma.$transaction([
      prisma.googleCalendarAccount.updateMany({
        where: {
          tenantId: session.user.tenantId,
          userId: session.user.id,
          isDefault: true,
          NOT: { id: account.id },
        },
        data: { isDefault: false },
      }),
      prisma.googleCalendarAccount.update({
        where: { id: account.id },
        data: {
          calendarId,
          prefs,
          isDefault: true,
          ...(body.color !== undefined ? { color: body.color } : {}),
        },
      }),
    ]);
  } else {
    await prisma.googleCalendarAccount.update({
      where: { id: account.id },
      data: {
        calendarId,
        prefs,
        ...(body.color !== undefined ? { color: body.color } : {}),
      },
    });
  }

  const updated = await prisma.googleCalendarAccount.findUniqueOrThrow({
    where: { id: account.id },
  });

  return NextResponse.json({
    ok: true,
    calendarId: updated.calendarId,
    prefs: updated.prefs,
    isDefault: updated.isDefault,
    color: updated.color,
  });
}
