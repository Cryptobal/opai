import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { logPlatformAction, platformActor } from '@/lib/platform/audit';

const STATUSES = new Set(['open', 'contacted', 'won', 'lost']);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: 'admin' });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const { id } = await params;
  const body = await request.json();
  const status = String(body.status ?? '');
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  }

  const existing = await prisma.upgradeRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
  }

  const updated = await prisma.upgradeRequest.update({
    where: { id },
    data: {
      status,
      handledBy: ctx.email,
      handledAt: status === 'open' ? null : new Date(),
    },
  });

  await logPlatformAction({
    ...platformActor(ctx),
    action: 'upgrade_request.handled',
    tenantId: existing.tenantId,
    targetType: 'UpgradeRequest',
    targetId: id,
    before: { status: existing.status },
    after: { status },
    request,
  });

  return NextResponse.json({
    success: true,
    request: {
      id: updated.id,
      status: updated.status,
      handledBy: updated.handledBy,
      handledAt: updated.handledAt?.toISOString() ?? null,
    },
  });
}
