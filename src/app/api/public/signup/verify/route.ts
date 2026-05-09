import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { provisionTenant } from "@/lib/tenant-provisioning";
import {
  notifyPlatform,
  type PlatformAlertSiiData,
} from "@/lib/notifications/notify-platform";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SiiRawShape {
  fechaInicioActividades?: string;
  esEmpresaMenorTamano?: boolean;
  actividadesEconomicas?: Array<{ codigo: string; descripcion: string }>;
}

function pickSiiSummary(raw: unknown): PlatformAlertSiiData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as SiiRawShape;
  return {
    fechaInicioActividades: r.fechaInicioActividades,
    esEmpresaMenorTamano: r.esEmpresaMenorTamano,
    actividadesEconomicas: r.actividadesEconomicas,
  };
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/registro/error?reason=missing_token", request.url));
  }

  const pending = await prisma.pendingSignup.findUnique({
    where: { verificationToken: token },
  });
  if (!pending) {
    return NextResponse.redirect(new URL("/registro/error?reason=invalid_token", request.url));
  }

  // Ya verificado → redirige a login
  if (pending.verifiedAt && pending.provisionedTenantId) {
    return NextResponse.redirect(
      new URL(
        `/opai/login?email=${encodeURIComponent(pending.email)}&verified=1`,
        request.url,
      ),
    );
  }

  if (pending.expiresAt < new Date()) {
    return NextResponse.redirect(
      new URL(
        `/registro/error?reason=expired&email=${encodeURIComponent(pending.email)}`,
        request.url,
      ),
    );
  }

  try {
    const result = await provisionTenant({
      name: pending.commercialName,
      slug: pending.proposedSlug,
      companyRut: pending.companyRut ?? undefined,
      ownerName: pending.ownerName,
      ownerEmail: pending.email,
      ownerPasswordHash: pending.passwordHash,
      plan: "profesional",
      trialDays: 30,
      legalName: pending.legalName ?? undefined,
      industry: pending.industry ?? undefined,
      estimatedGuards: pending.estimatedGuards ?? undefined,
      address: pending.address ?? undefined,
      commune: pending.commune ?? undefined,
      city: pending.city ?? undefined,
      giro: pending.giro ?? undefined,
      ownerPhone: pending.ownerPhone ?? undefined,
      signupSource: pending.source ?? "web",
      signupUtm: {
        source: pending.utmSource,
        campaign: pending.utmCampaign,
        medium: pending.utmMedium,
      },
    });

    await prisma.pendingSignup.update({
      where: { id: pending.id },
      data: {
        verifiedAt: new Date(),
        provisionedTenantId: result.tenant.id,
      },
    });

    // DPA aceptado al confirmar registro (Ley 21.719) — owner aceptó términos al signup
    await prisma.tenant.update({
      where: { id: result.tenant.id },
      data: {
        dpaAcceptedAt: new Date(),
        dpaAcceptedBy: pending.email,
        signupCompletedAt: new Date(),
      },
    });

    await prisma.adminOnboardingState.create({
      data: { adminId: result.admin.id },
    });

    await logAudit({
      action: "CREATE",
      entity: "Tenant",
      entityId: result.tenant.id,
      tenantId: result.tenant.id,
      userEmail: pending.email,
      details: { slug: result.tenant.slug, source: pending.source ?? "web" },
      request,
    });

    void notifyPlatform({
      event: "signup_verified",
      ownerEmail: pending.email,
      ownerName: pending.ownerName,
      ownerPhone: pending.ownerPhone,
      commercialName: pending.commercialName,
      legalName: pending.legalName,
      companyRut: pending.companyRut,
      industry: pending.industry,
      estimatedGuards: pending.estimatedGuards,
      address: pending.address,
      commune: pending.commune,
      city: pending.city,
      giro: pending.giro,
      siiData: pickSiiSummary(pending.siiData),
      source: pending.source,
      utmSource: pending.utmSource,
      utmCampaign: pending.utmCampaign,
      utmMedium: pending.utmMedium,
      ip: pending.ip,
      tenantSlug: result.tenant.slug,
      tenantUrl: `${getCanonicalSiteUrl()}/${result.tenant.slug}`,
      platformAdminUrl: `${getCanonicalSiteUrl()}/platform/tenants/${result.tenant.id}`,
    });

    return NextResponse.redirect(
      new URL(
        `/opai/login?email=${encodeURIComponent(pending.email)}&welcome=1`,
        request.url,
      ),
    );
  } catch (error) {
    console.error("[signup/verify] provisioning failed:", error);

    void notifyPlatform({
      event: "signup_failed",
      ownerEmail: pending.email,
      ownerName: pending.ownerName,
      commercialName: pending.commercialName,
      legalName: pending.legalName,
      companyRut: pending.companyRut,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.redirect(
      new URL("/registro/error?reason=provisioning_failed", request.url),
    );
  }
}
