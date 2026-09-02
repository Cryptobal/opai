import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { signIn } from '@/lib/auth';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: 'support' });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const { id } = await params;

  const owner = await prisma.admin.findFirst({
    where: { tenantId: id, role: 'owner', status: 'active' },
    include: { tenant: true },
  });

  if (!owner) {
    return NextResponse.json(
      { error: 'No se encontró un admin owner activo para este tenant' },
      { status: 404 },
    );
  }

  console.log(
    `[IMPERSONATE] Platform admin ${ctx.email} (${ctx.platformAdminId}) → tenant "${owner.tenant.name}" as ${owner.email}`,
  );

  const { logPlatformAction, platformActor } = await import('@/lib/platform/audit');
  await logPlatformAction({
    ...platformActor(ctx),
    action: 'tenant.impersonate',
    tenantId: id,
    targetType: 'Tenant',
    targetId: id,
    after: { ownerEmail: owner.email, tenantName: owner.tenant.name },
    request: _request,
  });

  try {
    await signIn('credentials', {
      email: owner.email,
      password: 'unused',
      portal: 'opai',
      __impersonate: 'true',
      __secret: process.env.PLATFORM_IMPERSONATE_SECRET,
      __adminId: owner.id,
      __fromEmail: ctx.email,
      redirect: false,
    });

    return NextResponse.json({
      success: true,
      redirectTo: '/hub',
      tenantName: owner.tenant.name,
    });
  } catch (error) {
    console.error('[IMPERSONATE] Failed:', error);
    return NextResponse.json(
      { error: 'Error al crear sesión de impersonate' },
      { status: 500 },
    );
  }
}
