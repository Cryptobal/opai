import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import {
  applyTransition,
  InvalidLifecycleTransitionError,
  normalizeBillingStatus,
} from '@/lib/platform/tenant-lifecycle';
import { logPlatformAction, platformActor } from '@/lib/platform/audit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const body = await request.json();
  const { reason } = body;

  if (!reason) {
    return NextResponse.json({ error: 'Se requiere una razón' }, { status: 400 });
  }

  try {
    await prisma.$transaction((tx) =>
      applyTransition(tx, {
        tenantId: id,
        to: 'suspended',
        reason,
        ...platformActor(ctx),
        request,
      }),
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof InvalidLifecycleTransitionError) {
      await prisma.tenant.update({
        where: { id },
        data: { active: false, suspendedAt: new Date(), suspendedReason: reason },
      });
      await logPlatformAction({
        ...platformActor(ctx),
        action: 'tenant.suspend',
        tenantId: id,
        targetType: 'Tenant',
        targetId: id,
        after: { active: false, reason, fallback: true },
        request,
      });
      return NextResponse.json({ success: true, fallbackKillSwitch: true });
    }
    const message = error instanceof Error ? error.message : 'Error al suspender';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const plan = await prisma.tenantPlan.findUnique({ where: { tenantId: id } });
  const status = normalizeBillingStatus(plan?.billingStatus);

  try {
    if (status === 'suspended' || status === 'cancelled') {
      await prisma.$transaction((tx) =>
        applyTransition(tx, {
          tenantId: id,
          to: 'active',
          reason: 'Reactivado desde platform',
          ...platformActor(ctx),
          request,
        }),
      );
    } else {
      await prisma.tenant.update({
        where: { id },
        data: { active: true, suspendedAt: null, suspendedReason: null },
      });
      await logPlatformAction({
        ...platformActor(ctx),
        action: 'tenant.unsuspend',
        tenantId: id,
        targetType: 'Tenant',
        targetId: id,
        after: { active: true },
        request,
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof InvalidLifecycleTransitionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Error al reactivar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
