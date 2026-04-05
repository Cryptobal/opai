import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { clearTenantModuleCache } from '@/lib/tenant-modules';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const body = await request.json();
  const { module, enabled } = body;

  if (!module || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'Se requiere module (string) y enabled (boolean)' },
      { status: 400 },
    );
  }

  await prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId: id, module } },
    update: { enabled },
    create: { tenantId: id, module, enabled },
  });

  clearTenantModuleCache(id);

  return NextResponse.json({ success: true });
}
