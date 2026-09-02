/**
 * Precio mensual de un tenant. Única fórmula para dashboard, facturación,
 * ficha y "Mi Plan". Aritmética en Prisma.Decimal; redondeo a 2 decimales
 * solo al serializar.
 */

import { Prisma } from "@prisma/client";

export type AddonPricingModel = "per_guard" | "flat" | "per_unit" | string;

export interface PricingPlanInput {
  plan: string;
  pricePerGuard: Prisma.Decimal | number | string | null;
  basePrice: Prisma.Decimal | number | string | null;
  customPricePerGuard?: Prisma.Decimal | number | string | null;
  customBaseMinimum?: Prisma.Decimal | number | string | null;
  currency?: string | null;
  billingStatus?: string | null;
}

export interface PricingAddonInput {
  slug: string;
  name: string;
  pricingModel: AddonPricingModel;
  priceAmount: Prisma.Decimal | number | string | null;
  customPrice?: Prisma.Decimal | number | string | null;
}

export interface PricingPackInput {
  slug: string;
  addonSlugs: string[];
  discountPct: Prisma.Decimal | number | string | null;
}

export interface TenantMonthlyPrice {
  planPrice: Prisma.Decimal;
  addonsTotal: Prisma.Decimal;
  packDiscount: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string;
  complete: boolean;
  countsTowardMrr: boolean;
  breakdown: {
    pricePerGuard: Prisma.Decimal;
    baseMinimum: Prisma.Decimal;
    guards: number;
    addonLines: { slug: string; name: string; amount: Prisma.Decimal }[];
  };
}

export interface SerializedTenantMonthlyPrice {
  planPrice: number;
  addonsTotal: number;
  packDiscount: number;
  total: number;
  currency: string;
  complete: boolean;
  countsTowardMrr: boolean;
  clpTotal: number | null;
  breakdown: {
    pricePerGuard: number;
    baseMinimum: number;
    guards: number;
    addonLines: { slug: string; name: string; amount: number }[];
  };
}

function dec(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (value == null || value === "") return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

function isPresent(
  value: Prisma.Decimal | number | string | null | undefined,
): boolean {
  return value != null && value !== "";
}

export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function moneyToNumber(value: Prisma.Decimal): number {
  return Number(roundMoney(value).toString());
}

export function isPricingComplete(plan: PricingPlanInput): boolean {
  const slug = plan.plan.toLowerCase();
  if (slug === "enterprise") return isPresent(plan.customBaseMinimum);
  return true;
}

function countsTowardMrr(plan: PricingPlanInput, complete: boolean): boolean {
  if (!complete) return false;
  const status = (plan.billingStatus ?? "").toLowerCase();
  if (status === "trial" || status === "trialing" || status === "trial_expired") return false;
  if (status === "suspended" || status === "cancelled") return false;
  if (plan.plan === "free" || plan.plan === "trial") return false;
  return status === "active" || status === "past_due" || status === "";
}

export function computeTenantMonthly(
  plan: PricingPlanInput,
  addons: PricingAddonInput[],
  packs: PricingPackInput[],
  activeGuards: number,
): TenantMonthlyPrice {
  const guards = Math.max(0, activeGuards);
  const pricePerGuard = isPresent(plan.customPricePerGuard)
    ? dec(plan.customPricePerGuard)
    : dec(plan.pricePerGuard);
  const baseMinimum = isPresent(plan.customBaseMinimum)
    ? dec(plan.customBaseMinimum)
    : dec(plan.basePrice);

  const usagePrice = pricePerGuard.mul(guards);
  const planPrice = Prisma.Decimal.max(usagePrice, baseMinimum);

  const addonLines: { slug: string; name: string; amount: Prisma.Decimal }[] = [];
  let addonsTotal = new Prisma.Decimal(0);

  for (const addon of addons) {
    const unit = isPresent(addon.customPrice) ? dec(addon.customPrice) : dec(addon.priceAmount);
    let amount = unit;
    if (addon.pricingModel === "per_guard") {
      amount = unit.mul(guards);
    }
    addonLines.push({ slug: addon.slug, name: addon.name, amount });
    addonsTotal = addonsTotal.add(amount);
  }

  const activeSlugs = new Set(addons.map((a) => a.slug));
  let packDiscount = new Prisma.Decimal(0);
  for (const pack of packs) {
    if (!pack.addonSlugs.length) continue;
    if (!pack.addonSlugs.every((s) => activeSlugs.has(s))) continue;
    const packTotal = addonLines
      .filter((line) => pack.addonSlugs.includes(line.slug))
      .reduce((sum, line) => sum.add(line.amount), new Prisma.Decimal(0));
    packDiscount = packDiscount.add(packTotal.mul(dec(pack.discountPct)).div(100));
  }

  const total = Prisma.Decimal.max(planPrice.add(addonsTotal).sub(packDiscount), new Prisma.Decimal(0));
  const complete = isPricingComplete(plan);

  return {
    planPrice,
    addonsTotal,
    packDiscount,
    total,
    currency: plan.currency || "UF",
    complete,
    countsTowardMrr: countsTowardMrr(plan, complete),
    breakdown: {
      pricePerGuard,
      baseMinimum,
      guards,
      addonLines,
    },
  };
}

export function serializeTenantMonthly(
  price: TenantMonthlyPrice,
  ufValue?: number | null,
): SerializedTenantMonthlyPrice {
  return {
    planPrice: moneyToNumber(price.planPrice),
    addonsTotal: moneyToNumber(price.addonsTotal),
    packDiscount: moneyToNumber(price.packDiscount),
    total: moneyToNumber(price.total),
    currency: price.currency,
    complete: price.complete,
    countsTowardMrr: price.countsTowardMrr,
    clpTotal:
      ufValue != null && Number.isFinite(ufValue)
        ? Math.round(moneyToNumber(price.total) * ufValue)
        : null,
    breakdown: {
      pricePerGuard: moneyToNumber(price.breakdown.pricePerGuard),
      baseMinimum: moneyToNumber(price.breakdown.baseMinimum),
      guards: price.breakdown.guards,
      addonLines: price.breakdown.addonLines.map((line) => ({
        slug: line.slug,
        name: line.name,
        amount: moneyToNumber(line.amount),
      })),
    },
  };
}
