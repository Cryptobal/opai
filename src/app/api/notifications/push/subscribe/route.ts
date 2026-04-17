import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, unauthorized } from '@/lib/api-auth';
import { getGuardSession } from '@/lib/portal-chat-auth';
import { requirePortalClienteAuth } from '@/lib/portal-cliente';

const VALID_USER_TYPES = new Set(['contact', 'guardia', 'admin']);
const VALID_PORTAL_TYPES = new Set(['cliente', 'guardia', 'rondas', 'app', 'supervisor', 'marcacion', 'acceso']);

export async function POST(req: NextRequest) {
  try {
    const { subscription, portalType, userType, userId, tenantId } = await req.json();

    if (!subscription?.endpoint || !userType || !portalType) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    if (!VALID_USER_TYPES.has(userType)) {
      return NextResponse.json({ error: 'Invalid userType' }, { status: 400 });
    }
    if (!VALID_PORTAL_TYPES.has(portalType)) {
      return NextResponse.json({ error: 'Invalid portalType' }, { status: 400 });
    }

    let resolvedUserId: string;
    let resolvedTenantId: string;

    // Admin/OPAI: derive from JWT session — NEVER trust body
    if (userType === 'admin' || portalType === 'app') {
      const ctx = await requireAuth();
      if (!ctx) return unauthorized();
      resolvedUserId = ctx.userId;
      resolvedTenantId = ctx.tenantId;
    } else {
      // Portal guardia/cliente: validate body matches session headers
      if (typeof tenantId !== 'string' || tenantId.trim() === '' || typeof userId !== 'string' || userId.trim() === '') {
        return NextResponse.json({ error: 'Missing userId/tenantId for portal' }, { status: 400 });
      }
      if (userType === 'guardia') {
        const session = getGuardSession(req);
        if (!session) {
          return NextResponse.json({ error: 'Portal session required (x-guardia-id, x-tenant-id)' }, { status: 401 });
        }
        if (session.tenantId !== tenantId || session.guardiaId !== userId) {
          return NextResponse.json({ error: 'Session mismatch' }, { status: 403 });
        }
        resolvedUserId = session.guardiaId;
        resolvedTenantId = session.tenantId;
      } else if (userType === 'contact') {
        const session = await requirePortalClienteAuth(req);
        if (!session) {
          return NextResponse.json({ error: 'Portal session required' }, { status: 401 });
        }
        if (session.tenantId !== tenantId || session.contactId !== userId) {
          return NextResponse.json({ error: 'Session mismatch' }, { status: 403 });
        }
        resolvedUserId = session.contactId;
        resolvedTenantId = session.tenantId;
      } else {
        return NextResponse.json({ error: 'Invalid userType for portal' }, { status: 400 });
      }
    }

    const senderTypeMap: Record<string, string> = {
      contact: 'CLIENT',
      guardia: 'GUARD',
      admin: 'ADMIN',
    };
    const subscriberType = senderTypeMap[userType];

    await prisma.chatPushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        portalType: portalType,
        isActive: true,
      },
      create: {
        tenantId: resolvedTenantId,
        subscriberType: subscriberType as any,
        subscriberId: resolvedUserId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: req.headers.get('user-agent') || undefined,
        portalType: portalType,
      },
    });

    // Create default preferences if they don't exist (portal users only)
    if (userType !== 'admin') {
      const existing = await prisma.portalNotificationPreference.findUnique({
        where: { userType_userId_portalType: { userType, userId: resolvedUserId, portalType } },
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
          data: { tenantId: resolvedTenantId, userType, userId: resolvedUserId, portalType, preferences: defaults },
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

    // Verify ownership: admin via JWT, portal via headers
    const ctx = await requireAuth();
    if (ctx) {
      // Admin: verify subscription belongs to tenant
      const sub = await prisma.chatPushSubscription.findUnique({
        where: { endpoint },
        select: { tenantId: true },
      });
      if (sub && sub.tenantId !== ctx.tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const guardSession = getGuardSession(req);
      const clientSession = guardSession ? null : await requirePortalClienteAuth(req);
      if (guardSession || clientSession) {
        const tenantIdFromSession = guardSession ? guardSession.tenantId : clientSession!.tenantId;
        const expectedId = guardSession ? guardSession.guardiaId : clientSession!.contactId;
        const sub = await prisma.chatPushSubscription.findUnique({
          where: { endpoint },
          select: { tenantId: true, subscriberId: true },
        });
        if (!sub || sub.tenantId !== tenantIdFromSession || sub.subscriberId !== expectedId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      } else {
        return unauthorized();
      }
    }

    await prisma.chatPushSubscription.updateMany({
      where: { endpoint },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/subscribe] DELETE error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
