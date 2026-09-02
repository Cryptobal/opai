import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { prisma } from "@/lib/prisma";
import { computeTenantMonthly, serializeTenantMonthly } from "@/lib/platform/pricing";
import { getUfValue } from "@/lib/uf";
import { getCatalogIncludedModules } from "@/lib/tenant-modules";
import { addonsAbsorbedByPlan } from "@/lib/platform/catalog-validate";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: "support" });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: {
    plan?: string;
    pricingMode?: "catalog" | "negotiated";
    customPricePerGuard?: number | null;
    customBaseMinimum?: number | null;
    addons?: { slug: string; enabled: boolean; customPrice?: number | null }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      plan: true,
      tenantAddons: { include: { addon: true } },
    },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  const planSlug = body.plan ?? tenant.plan?.plan;
  if (!planSlug) {
    return NextResponse.json({ error: "El tenant no tiene plan asignado" }, { status: 400 });
  }

  const [catalog, packs, ufValue, guards] = await Promise.all([
    prisma.planCatalog.findUnique({ where: { slug: planSlug } }),
    prisma.packCatalog.findMany(),
    getUfValue().catch(() => null),
    prisma.opsGuardia.count({ where: { tenantId: id, status: "active" } }),
  ]);

  if (!catalog) {
    return NextResponse.json(
      { error: `Plan "${planSlug}" no existe en el catálogo` },
      { status: 400 },
    );
  }

  const pricingMode =
    planSlug.toLowerCase() === "enterprise" ? "negotiated" : (body.pricingMode ?? "catalog");

  const planInput = {
    plan: catalog.slug,
    pricePerGuard: catalog.pricePerGuard,
    basePrice: catalog.baseMinimum,
    currency: tenant.plan?.currency ?? "UF",
    billingStatus: tenant.plan?.billingStatus ?? "trialing",
    customPricePerGuard:
      pricingMode === "negotiated"
        ? (body.customPricePerGuard ?? tenant.plan?.customPricePerGuard ?? null)
        : null,
    customBaseMinimum:
      pricingMode === "negotiated"
        ? (body.customBaseMinimum ?? tenant.plan?.customBaseMinimum ?? null)
        : null,
  };

  const included = await getCatalogIncludedModules(catalog.slug);
  const catalogAddons = await prisma.addonCatalog.findMany({ where: { active: true } });
  const requested = new Map((body.addons ?? []).map((a) => [a.slug, a]));

  const addonLines = catalogAddons
    .filter((addon) => {
      const req = requested.get(addon.slug);
      const currentlyOn = tenant.tenantAddons.some((ta) => ta.enabled && ta.addonId === addon.id);
      const enabled = req ? req.enabled : currentlyOn;
      if (!enabled) return false;
      if (addon.moduleKey && included.includes(addon.moduleKey as never)) return false;
      return true;
    })
    .map((addon) => {
      const req = requested.get(addon.slug);
      const existing = tenant.tenantAddons.find((ta) => ta.addonId === addon.id);
      return {
        slug: addon.slug,
        name: addon.name,
        pricingModel: addon.pricingModel,
        priceAmount: addon.priceAmount,
        customPrice:
          req && "customPrice" in req
            ? req.customPrice
            : (existing?.customPrice ?? null),
      };
    });

  const absorbed = addonsAbsorbedByPlan(
    catalogAddons.map((a) => ({ slug: a.slug, moduleKey: a.moduleKey })),
    included,
  );

  const price = computeTenantMonthly(planInput, addonLines, packs, guards);
  const serialized = serializeTenantMonthly(price, ufValue);

  return NextResponse.json({
    pricing: serialized,
    absorbedAddons: absorbed,
    pricingMode,
    plan: catalog.slug,
    guards,
  });
}
