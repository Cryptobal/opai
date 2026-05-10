import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const pending = await prisma.pendingSignup.findMany({
    where: { verifiedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      ownerName: true,
      ownerPhone: true,
      commercialName: true,
      legalName: true,
      companyRut: true,
      proposedSlug: true,
      industry: true,
      estimatedGuards: true,
      requiresReview: true,
      reviewReason: true,
      createdAt: true,
      expiresAt: true,
      resentCount: true,
      verificationSentAt: true,
    },
  });

  const now = new Date();
  return NextResponse.json({
    pendingSignups: pending.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      expiresAt: p.expiresAt.toISOString(),
      verificationSentAt: p.verificationSentAt.toISOString(),
      isExpired: p.expiresAt < now,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const id = request.nextUrl.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Falta query param: id' }, { status: 400 });
  }

  const pending = await prisma.pendingSignup.findUnique({
    where: { id },
    select: { id: true, email: true, proposedSlug: true, verifiedAt: true },
  });

  if (!pending) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  if (pending.verifiedAt) {
    return NextResponse.json(
      {
        error:
          'Este registro ya fue verificado y promovido a tenant. No se puede borrar desde aquí.',
      },
      { status: 400 },
    );
  }

  await prisma.pendingSignup.delete({ where: { id } });

  await logAudit({
    action: 'DELETE',
    entity: 'PendingSignup',
    entityId: pending.id,
    tenantId: null,
    userEmail: ctx.email,
    details: { email: pending.email, slug: pending.proposedSlug },
    request,
  });

  return NextResponse.json({ success: true });
}
