import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;

  // Get tenant's active addons with catalog info
  const tenantAddons = await prisma.tenantAddon.findMany({
    where: { tenantId: id, enabled: true },
    include: { addon: true },
  });

  // Get all available addons from catalog
  const allAddons = await prisma.addonCatalog.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  });

  // Get active packs
  const packs = await prisma.packCatalog.findMany({
    where: { active: true },
  });

  // Check which packs are fully applied
  const activeAddonSlugs = new Set(
    tenantAddons.map((ta) => ta.addon.slug),
  );

  const packsWithStatus = packs.map((pack) => {
    const allApplied = pack.addonSlugs.every((s) => activeAddonSlugs.has(s));
    return {
      ...pack,
      discountPct: Number(pack.discountPct),
      applied: allApplied,
    };
  });

  return NextResponse.json({
    activeAddons: tenantAddons.map((ta) => ({
      id: ta.id,
      addonSlug: ta.addon.slug,
      addonName: ta.addon.name,
      addonTag: ta.addon.tag,
      pricingModel: ta.addon.pricingModel,
      catalogPrice: Number(ta.addon.priceAmount),
      priceUnit: ta.addon.priceUnit,
      customPrice: ta.customPrice ? Number(ta.customPrice) : null,
      effectivePrice: ta.customPrice ? Number(ta.customPrice) : Number(ta.addon.priceAmount),
      packId: ta.packId,
    })),
    availableAddons: allAddons.map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      description: a.description,
      pricingModel: a.pricingModel,
      priceAmount: Number(a.priceAmount),
      priceUnit: a.priceUnit,
      moduleKey: a.moduleKey,
      tag: a.tag,
      isActive: activeAddonSlugs.has(a.slug),
    })),
    packs: packsWithStatus,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const body = await request.json();
  const { addonSlug, customPrice } = body;

  if (!addonSlug) {
    return NextResponse.json({ error: 'addonSlug is required' }, { status: 400 });
  }

  const addon = await prisma.addonCatalog.findUnique({ where: { slug: addonSlug } });
  if (!addon) {
    return NextResponse.json({ error: 'Add-on not found' }, { status: 404 });
  }

  // Upsert the tenant addon
  await prisma.tenantAddon.upsert({
    where: { tenantId_addonId: { tenantId: id, addonId: addon.id } },
    update: { enabled: true, customPrice: customPrice ?? null, deactivatedAt: null },
    create: {
      tenantId: id,
      addonId: addon.id,
      enabled: true,
      customPrice: customPrice ?? null,
    },
  });

  // If addon has a moduleKey, enable the TenantModule
  if (addon.moduleKey) {
    await prisma.tenantModule.upsert({
      where: { tenantId_module: { tenantId: id, module: addon.moduleKey } },
      update: { enabled: true },
      create: { tenantId: id, module: addon.moduleKey, enabled: true },
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const addonSlug = request.nextUrl.searchParams.get('addon');

  if (!addonSlug) {
    return NextResponse.json({ error: 'addon query param required' }, { status: 400 });
  }

  const addon = await prisma.addonCatalog.findUnique({ where: { slug: addonSlug } });
  if (!addon) {
    return NextResponse.json({ error: 'Add-on not found' }, { status: 404 });
  }

  // Disable the tenant addon
  const existing = await prisma.tenantAddon.findUnique({
    where: { tenantId_addonId: { tenantId: id, addonId: addon.id } },
  });

  if (existing) {
    await prisma.tenantAddon.update({
      where: { id: existing.id },
      data: { enabled: false, deactivatedAt: new Date() },
    });
  }

  // If addon has a moduleKey, disable the TenantModule
  if (addon.moduleKey) {
    const tenantModule = await prisma.tenantModule.findUnique({
      where: { tenantId_module: { tenantId: id, module: addon.moduleKey } },
    });
    if (tenantModule) {
      await prisma.tenantModule.update({
        where: { id: tenantModule.id },
        data: { enabled: false },
      });
    }
  }

  return NextResponse.json({ success: true });
}
