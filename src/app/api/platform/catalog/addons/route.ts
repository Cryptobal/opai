import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { prisma } from "@/lib/prisma";
import { logPlatformAction, platformActor } from "@/lib/platform/audit";
import {
  validateAddonPricingModel,
  validateModuleKey,
} from "@/lib/platform/catalog-validate";

export async function GET() {
  const auth = await requirePlatformAuth({ minRole: "support" });
  if (!auth.ok) return auth.response;

  const addons = await prisma.addonCatalog.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({
    addons: addons.map((a) => ({
      ...a,
      priceAmount: Number(a.priceAmount),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAuth({ minRole: "owner" });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const body = await request.json();
  const slug = String(body.slug ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!slug || !name) {
    return NextResponse.json({ error: "slug y name son requeridos" }, { status: 400 });
  }

  const modelErr = validateAddonPricingModel(String(body.pricingModel ?? "flat"), {
    allowPerUnit: false,
  });
  if (modelErr) return NextResponse.json({ error: modelErr }, { status: 400 });

  if (body.moduleKey) {
    const err = validateModuleKey(String(body.moduleKey));
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const created = await prisma.addonCatalog.create({
    data: {
      slug,
      name,
      description: body.description ?? null,
      pricingModel: body.pricingModel,
      priceAmount: body.priceAmount ?? 0,
      priceUnit: body.priceUnit ?? "UF",
      moduleKey: body.moduleKey ?? null,
      tag: body.tag ?? null,
      sortOrder: body.sortOrder ?? 0,
      active: body.active !== false,
    },
  });

  await logPlatformAction({
    ...platformActor(ctx),
    action: "catalog.addon.create",
    targetType: "AddonCatalog",
    targetId: created.id,
    after: { slug, name, moduleKey: created.moduleKey },
    request,
  });

  return NextResponse.json(
    { success: true, addon: { ...created, priceAmount: Number(created.priceAmount) } },
    { status: 201 },
  );
}
