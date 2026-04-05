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
  const { packSlug } = body;

  if (!packSlug) {
    return NextResponse.json({ error: 'packSlug is required' }, { status: 400 });
  }

  const pack = await prisma.packCatalog.findUnique({ where: { slug: packSlug } });
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  // Find all addons in the pack
  const addons = await prisma.addonCatalog.findMany({
    where: { slug: { in: pack.addonSlugs } },
  });

  const activatedAddons: string[] = [];

  for (const addon of addons) {
    await prisma.tenantAddon.upsert({
      where: { tenantId_addonId: { tenantId: id, addonId: addon.id } },
      update: { enabled: true, packId: pack.id, deactivatedAt: null },
      create: {
        tenantId: id,
        addonId: addon.id,
        enabled: true,
        packId: pack.id,
      },
    });

    // Enable corresponding module if needed
    if (addon.moduleKey) {
      await prisma.tenantModule.upsert({
        where: { tenantId_module: { tenantId: id, module: addon.moduleKey } },
        update: { enabled: true },
        create: { tenantId: id, module: addon.moduleKey, enabled: true },
      });
    }

    activatedAddons.push(addon.slug);
  }

  return NextResponse.json({ success: true, activatedAddons });
}
