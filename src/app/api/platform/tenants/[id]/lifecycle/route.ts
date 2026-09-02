import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";
import { prisma } from "@/lib/prisma";
import { platformActor } from "@/lib/platform/audit";
import {
  actionToStatus,
  applyTransition,
  InvalidLifecycleTransitionError,
  resolveTenantAccess,
  serializeAccess,
  type LifecycleAction,
} from "@/lib/platform/tenant-lifecycle";
import { isPricingComplete } from "@/lib/platform/pricing";

const ACTIONS = new Set<LifecycleAction>([
  "activate",
  "extend_trial",
  "mark_past_due",
  "suspend",
  "reactivate",
  "cancel",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  let body: {
    action?: string;
    reason?: string;
    trialEndsAt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const action = body.action as LifecycleAction | undefined;
  const reason = body.reason?.trim();
  if (!action || !ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "action inválida", allowed: [...ACTIONS] },
      { status: 400 },
    );
  }
  if (!reason) {
    return NextResponse.json({ error: "Se requiere una razón" }, { status: 400 });
  }

  const to = actionToStatus(action);
  if (!to) {
    return NextResponse.json({ error: "action inválida" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: { plan: true },
  });
  if (!tenant?.plan) {
    return NextResponse.json({ error: "Tenant o plan no encontrado" }, { status: 404 });
  }

  if (to === "active") {
    const complete = isPricingComplete({
      plan: tenant.plan.plan,
      pricePerGuard: tenant.plan.pricePerGuard,
      basePrice: tenant.plan.basePrice,
      customPricePerGuard: tenant.plan.customPricePerGuard,
      customBaseMinimum: tenant.plan.customBaseMinimum,
    });
    if (!complete) {
      return NextResponse.json(
        {
          error: "No se puede activar sin precio negociado (customBaseMinimum).",
          code: "PRICING_INCOMPLETE",
        },
        { status: 409 },
      );
    }
  }

  let trialEndsAt: Date | undefined;
  if (action === "extend_trial") {
    if (!body.trialEndsAt) {
      return NextResponse.json(
        { error: "extend_trial requiere trialEndsAt" },
        { status: 400 },
      );
    }
    trialEndsAt = new Date(body.trialEndsAt);
    if (Number.isNaN(trialEndsAt.getTime())) {
      return NextResponse.json({ error: "trialEndsAt inválido" }, { status: 400 });
    }
  }

  try {
    const result = await prisma.$transaction((tx) =>
      applyTransition(tx, {
        tenantId: id,
        to,
        reason,
        ...platformActor(ctx),
        trialEndsAt,
        request,
      }),
    );

    const access = await resolveTenantAccess(id);
    return NextResponse.json({
      success: true,
      plan: {
        plan: tenant.plan.plan,
        billingStatus: result.plan.billingStatus,
        trialEndsAt: result.plan.trialEndsAt?.toISOString() ?? null,
        graceEndsAt: result.plan.graceEndsAt?.toISOString() ?? null,
        statusChangedAt: result.plan.statusChangedAt?.toISOString() ?? null,
        statusReason: result.plan.statusReason,
      },
      access: serializeAccess(access),
    });
  } catch (error) {
    if (error instanceof InvalidLifecycleTransitionError) {
      return NextResponse.json(
        { error: error.message, code: error.code, from: error.from, to: error.to },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Error de lifecycle";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
