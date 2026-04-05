import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

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

  await prisma.tenant.update({
    where: { id },
    data: {
      active: false,
      suspendedAt: new Date(),
      suspendedReason: reason,
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;

  await prisma.tenant.update({
    where: { id },
    data: {
      active: true,
      suspendedAt: null,
      suspendedReason: null,
    },
  });

  return NextResponse.json({ success: true });
}
