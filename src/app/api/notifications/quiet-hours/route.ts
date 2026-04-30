import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const pref = await prisma.notificationPreference.findUnique({
    where: { subscriberType_subscriberId: { subscriberType: 'ADMIN', subscriberId: ctx.userId } },
    select: { quietHoursStart: true, quietHoursEnd: true, quietHoursTz: true },
  });
  return NextResponse.json({
    success: true,
    data: {
      quietHoursStart: pref?.quietHoursStart ?? null,
      quietHoursEnd: pref?.quietHoursEnd ?? null,
      quietHoursTz: pref?.quietHoursTz ?? 'America/Santiago',
    },
  });
}

interface Body {
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  quietHoursTz?: string;
}

function isValidHour(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23;
}

export async function PUT(req: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as Body;
  const { quietHoursStart, quietHoursEnd, quietHoursTz } = body;

  // Both null = clear quiet hours; both set = enable; mismatched = invalid
  const startOk = quietHoursStart === null || quietHoursStart === undefined || isValidHour(quietHoursStart);
  const endOk = quietHoursEnd === null || quietHoursEnd === undefined || isValidHour(quietHoursEnd);
  const bothOrNeither =
    (quietHoursStart === null || quietHoursStart === undefined) ===
    (quietHoursEnd === null || quietHoursEnd === undefined);
  if (!startOk || !endOk || !bothOrNeither) {
    return NextResponse.json({ success: false, error: 'Invalid quiet hours' }, { status: 400 });
  }

  const tz = quietHoursTz ?? 'America/Santiago';

  await prisma.notificationPreference.upsert({
    where: { subscriberType_subscriberId: { subscriberType: 'ADMIN', subscriberId: ctx.userId } },
    update: { quietHoursStart: quietHoursStart ?? null, quietHoursEnd: quietHoursEnd ?? null, quietHoursTz: tz },
    create: {
      tenantId: ctx.tenantId,
      subscriberType: 'ADMIN',
      subscriberId: ctx.userId,
      preferences: {},
      quietHoursStart: quietHoursStart ?? null,
      quietHoursEnd: quietHoursEnd ?? null,
      quietHoursTz: tz,
    },
  });

  return NextResponse.json({ success: true });
}
