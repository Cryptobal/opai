/**
 * GET /api/onboarding/preview?dealId=...
 *
 * Devuelve datos para el modal de onboarding: validaciones (semáforo),
 * playbook por defecto con steps, y estado de configuración de plataforma.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { getPlatformConfigStatus } from "@/lib/onboarding/platform-status";

type Light = "green" | "red";
const LG: Light = "green";
const LR: Light = "red";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const dealId = request.nextUrl.searchParams.get("dealId");
    if (!dealId) {
      return NextResponse.json(
        { success: false, error: "dealId requerido" },
        { status: 400 },
      );
    }

    const deal = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId: ctx.tenantId },
      include: {
        account: true,
        primaryContact: true,
        stage: { select: { id: true, name: true } },
      },
    });
    if (!deal) {
      return NextResponse.json(
        { success: false, error: "Deal no encontrado" },
        { status: 404 },
      );
    }

    let installation = null;
    if (deal.accountId) {
      installation = await prisma.crmInstallation.findFirst({
        where: { tenantId: ctx.tenantId, accountId: deal.accountId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          commune: true,
          lat: true,
          lng: true,
          marcacionCode: true,
        },
      });
    }

    const defaultPlaybook = await prisma.onboardingPlaybook.findFirst({
      where: { tenantId: ctx.tenantId, isDefault: true, isActive: true },
      include: {
        steps: { orderBy: [{ phase: "asc" }, { sortOrder: "asc" }] },
      },
    });

    const platformConfigStatus = await getPlatformConfigStatus(
      ctx.tenantId,
      installation?.id ?? null,
    );

    // TODO: integrar tabla de OS-10 del tenant cuando exista; por ahora siempre green.
    const validations = {
      osTenant: LG,
      accountInfoComplete:
        deal.account?.name && (deal.account.rut || deal.account.legalName)
          ? LG
          : LR,
      installationLinked: installation ? LG : LR,
      primaryContactWithEmail:
        deal.primaryContact?.email ? LG : LR,
      serviceStartDate: deal.serviceStartDate ? LG : LR,
    } satisfies Record<string, Light>;

    return NextResponse.json({
      success: true,
      data: {
        validations,
        account: deal.account,
        installation,
        primaryContact: deal.primaryContact
          ? {
              firstName: deal.primaryContact.firstName,
              lastName: deal.primaryContact.lastName,
              email: deal.primaryContact.email ?? null,
              phone: deal.primaryContact.phone ?? null,
            }
          : null,
        serviceStartDate: deal.serviceStartDate,
        defaultPlaybook,
        platformConfigStatus,
        deal: {
          id: deal.id,
          title: deal.title,
          accountId: deal.accountId,
          primaryContactId: deal.primaryContactId,
          activeQuotationId: deal.activeQuotationId ?? null,
          stageName: deal.stage?.name ?? null,
        },
      },
    });
  } catch (error) {
    console.error("[onboarding] preview failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to compute preview" },
      { status: 500 },
    );
  }
}
