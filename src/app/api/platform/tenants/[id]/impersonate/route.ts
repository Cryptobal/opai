import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { signIn } from '@/lib/auth';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

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
