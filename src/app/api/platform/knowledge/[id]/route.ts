import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { ensureKnowledgeTables } from '@/lib/knowledge/ensure-tables';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requirePlatformAuth({ minRole: 'support' });
  if (!auth.ok) return auth.response;

  try {
    await ensureKnowledgeTables();
  } catch (e) {
    console.error('[Platform Knowledge GET] ensure', e);
    return NextResponse.json({ success: false, error: 'Error de base de datos' }, { status: 500 });
  }

  const { id } = await context.params;

  const kb = await prisma.knowledgeBase.findFirst({
    where: { id, tenantId: null },
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
  const auth = await requirePlatformAuth({ minRole: 'admin' });
  if (!auth.ok) return auth.response;

  await ensureKnowledgeTables();

  const { id } = await context.params;

  const kb = await prisma.knowledgeBase.findFirst({
    where: { id, tenantId: null },
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
  const auth = await requirePlatformAuth({ minRole: 'admin' });
  if (!auth.ok) return auth.response;

  await ensureKnowledgeTables();

  const { id } = await context.params;

  const kb = await prisma.knowledgeBase.findFirst({
    where: { id, tenantId: null },
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
