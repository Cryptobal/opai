import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { subscription, portalType, userType, userId, tenantId } = await req.json();

    if (!subscription?.endpoint || !userType || !userId || !tenantId || !portalType) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const senderTypeMap: Record<string, string> = {
      contact: 'CLIENT',
      guardia: 'GUARD',
      admin: 'ADMIN',
    };
    const subscriberType = senderTypeMap[userType];
    if (!subscriberType) {
      return NextResponse.json({ error: 'Invalid userType' }, { status: 400 });
    }

    await prisma.chatPushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        isActive: true,
      },
      create: {
        tenantId,
        subscriberType: subscriberType as any,
        subscriberId: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: req.headers.get('user-agent') || undefined,
      },
    });

    // Create default preferences if they don't exist (portal users only)
    if (userType !== 'admin') {
      const existing = await prisma.portalNotificationPreference.findUnique({
        where: { userType_userId_portalType: { userType, userId, portalType } },
      });

      if (!existing) {
        const { PORTAL_NOTIFICATION_TYPES } = await import('@/lib/pwa/portal-notification-types');
        const defaults: Record<string, any> = {};
        for (const t of PORTAL_NOTIFICATION_TYPES) {
          if (t.portals.includes(portalType as any)) {
            defaults[t.key] = { push: t.defaultPush, email: t.defaultEmail };
          }
        }
        await prisma.portalNotificationPreference.create({
          data: { tenantId, userType, userId, portalType, preferences: defaults },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/subscribe] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });

    await prisma.chatPushSubscription.update({
      where: { endpoint },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/subscribe] DELETE error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
