import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getCalendarClientForUser } from "@/lib/google-workspace";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;
  const isAdmin = ["owner", "admin"].includes(session.user.role ?? "");

  const mine = await prisma.googleCalendarAccount.findUnique({
    where: { tenantId_userId: { tenantId, userId: session.user.id } },
  });

  let team: Array<{ userId: string; name: string; email: string; connected: boolean }> = [];
  if (isAdmin) {
    const users = await prisma.admin.findMany({
      where: { tenantId, status: "active" },
      select: { id: true, name: true, email: true },
      take: 100,
    });
    const accounts = await prisma.googleCalendarAccount.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { userId: true },
    });
    const connectedIds = new Set(accounts.map((a) => a.userId));
    team = users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      connected: connectedIds.has(u.id),
    }));
  }

  return NextResponse.json({
    connected: mine?.status === "ACTIVE",
    googleEmail: mine?.googleEmail ?? null,
    calendarId: mine?.calendarId ?? "primary",
    prefs: mine?.prefs ?? {},
    team,
  });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    calendarId?: string;
    prefs?: Record<string, unknown>;
    createDedicated?: boolean;
  };

  const account = await prisma.googleCalendarAccount.findFirst({
    where: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      status: "ACTIVE",
    },
  });
  if (!account) {
    return NextResponse.json({ error: "Calendar no conectado" }, { status: 400 });
  }

  let calendarId = body.calendarId ?? account.calendarId;
  if (body.createDedicated) {
    const client = await getCalendarClientForUser(session.user.tenantId, session.user.id);
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

  const updated = await prisma.googleCalendarAccount.update({
    where: { id: account.id },
    data: { calendarId, prefs },
  });

  return NextResponse.json({
    ok: true,
    calendarId: updated.calendarId,
    prefs: updated.prefs,
  });
}
