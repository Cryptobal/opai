import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorized } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { logPlatformAction } from '@/lib/platform/audit';
import { notifyPlatform } from '@/lib/notifications/notify-platform';
import { buildEmailUrl } from '@/lib/emails/site-url';

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { tenantId, userEmail, userId } = ctx;

  const body = await request.json();
  const { requestedPlan, requestedAddons, message } = body as {
    requestedPlan?: string;
    requestedAddons?: string[];
    message?: string;
  };

  if (!requestedPlan && (!requestedAddons || requestedAddons.length === 0)) {
    return NextResponse.json(
      { error: 'Debe solicitar un plan o al menos un add-on' },
      { status: 400 },
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, slug: true },
  });

  const created = await prisma.upgradeRequest.create({
    data: {
      tenantId,
      requestedBy: userId,
      requestedPlan: requestedPlan ?? null,
      requestedAddons: requestedAddons ?? [],
      message: message ?? null,
      status: 'open',
    },
  });

  await logPlatformAction({
    actorType: 'system',
    actorId: userId,
    actorEmail: userEmail,
    action: 'upgrade_request.received',
    tenantId,
    targetType: 'UpgradeRequest',
    targetId: created.id,
    after: {
      requestedPlan: requestedPlan ?? null,
      requestedAddons: requestedAddons ?? [],
    },
    request,
  });

  await notifyPlatform({
    event: 'upgrade_requested',
    ownerEmail: userEmail,
    ownerName: userEmail,
    commercialName: tenant?.name ?? tenantId,
    tenantSlug: tenant?.slug,
    platformAdminUrl: buildEmailUrl(`/platform/tenants/${tenantId}`),
    errorMessage: [
      requestedPlan ? `Plan: ${requestedPlan}` : null,
      requestedAddons?.length ? `Add-ons: ${requestedAddons.join(', ')}` : null,
      message ? `Mensaje: ${message}` : null,
      `Solicitado por: ${userEmail}`,
    ]
      .filter(Boolean)
      .join(' · '),
  });

  return NextResponse.json({ success: true, id: created.id });
}
