import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const userType = req.nextUrl.searchParams.get('userType');
  const userId = req.nextUrl.searchParams.get('userId');
  const portalType = req.nextUrl.searchParams.get('portalType');

  if (!userType || !userId || !portalType) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const prefs = await prisma.portalNotificationPreference.findUnique({
    where: { userType_userId_portalType: { userType, userId, portalType } },
  });

  return NextResponse.json({ preferences: prefs?.preferences || {} });
}

export async function PUT(req: NextRequest) {
  const { userType, userId, tenantId, portalType, preferences } = await req.json();

  if (!userType || !userId || !portalType || !preferences) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  await prisma.portalNotificationPreference.upsert({
    where: { userType_userId_portalType: { userType, userId, portalType } },
    update: { preferences },
    create: { tenantId, userType, userId, portalType, preferences },
  });

  return NextResponse.json({ success: true });
}
