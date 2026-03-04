import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PORTAL_NOTIFICATION_TYPE_MAP } from '@/lib/pwa/portal-notification-types';

// Auth note: Portal routes in this codebase use a PIN-based session stored in
// the browser and passed as custom headers by the frontend for authenticated
// chat routes. Push preference routes are called from the browser after
// PIN-auth succeeds, so userId comes from the authenticated session in the
// client. We validate that required fields are non-empty strings (consistent
// with simpler portal routes like /api/portal/guardia/profile).

const VALID_USER_TYPES = new Set(['contact', 'guardia', 'admin']);
const VALID_PORTAL_TYPES = new Set(['cliente', 'guardia', 'rondas', 'app']);

export async function GET(req: NextRequest) {
  try {
    const userType = req.nextUrl.searchParams.get('userType');
    const userId = req.nextUrl.searchParams.get('userId');
    const portalType = req.nextUrl.searchParams.get('portalType');

    if (!userType || !userId || !portalType) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    if (!VALID_USER_TYPES.has(userType) || !VALID_PORTAL_TYPES.has(portalType)) {
      return NextResponse.json({ error: 'Invalid userType or portalType' }, { status: 400 });
    }

    const prefs = await prisma.portalNotificationPreference.findUnique({
      where: { userType_userId_portalType: { userType, userId, portalType } },
    });

    return NextResponse.json({ preferences: prefs?.preferences || {} });
  } catch (error) {
    console.error('[push/preferences] GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userType, userId, tenantId, portalType, preferences } = await req.json();

    if (!userType || !userId || !portalType || !preferences) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Sanitize preferences: only allow known notification type keys and boolean values.
    // This prevents arbitrary JSON blobs from being persisted to the database.
    const cleanedPreferences: Record<string, { push?: boolean; email?: boolean }> = {};
    for (const [key, value] of Object.entries(preferences)) {
      if (PORTAL_NOTIFICATION_TYPE_MAP.has(key) && typeof value === 'object' && value !== null) {
        cleanedPreferences[key] = {
          push: typeof (value as any).push === 'boolean' ? (value as any).push : undefined,
          email: typeof (value as any).email === 'boolean' ? (value as any).email : undefined,
        };
      }
    }

    await prisma.portalNotificationPreference.upsert({
      where: { userType_userId_portalType: { userType, userId, portalType } },
      update: { preferences: cleanedPreferences },
      create: { tenantId, userType, userId, portalType, preferences: cleanedPreferences },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/preferences] PUT error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
