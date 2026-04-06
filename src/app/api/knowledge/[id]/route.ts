import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorized } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id } = await context.params;

  const kb = await prisma.knowledgeBase.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      chunks: {
        select: { id: true, chunkIndex: true, tokenCount: true, createdAt: true },
        orderBy: { chunkIndex: 'asc' },
      },
    },
  });

  if (!kb) {
    return NextResponse.json(
      { success: false, error: 'No encontrado' },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: kb });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id } = await context.params;

  const kb = await prisma.knowledgeBase.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });

  if (!kb) {
    return NextResponse.json(
      { success: false, error: 'No encontrado' },
      { status: 404 },
    );
  }

  const body = await request.json();
  const { title, category, enabled, description } = body as {
    title?: string;
    category?: string;
    enabled?: boolean;
    description?: string;
  };

  const updated = await prisma.knowledgeBase.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(category !== undefined && { category }),
      ...(enabled !== undefined && { enabled }),
      ...(description !== undefined && { description }),
    },
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id } = await context.params;

  const kb = await prisma.knowledgeBase.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });

  if (!kb) {
    return NextResponse.json(
      { success: false, error: 'No encontrado' },
      { status: 404 },
    );
  }

  await prisma.knowledgeBase.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
