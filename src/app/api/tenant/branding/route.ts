import { NextRequest, NextResponse } from "next/server";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

/**
 * Public branding endpoint — returns only public-facing branding data
 * (name, logo, primary color). No financial, operational, or configuration
 * data is exposed. Used by the mobile hubs (Terreno / Personal) to show
 * per-tenant branding before the user picks a portal.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId");

  if (!tenantId) {
    return NextResponse.json(
      { error: "tenantId required" },
      { status: 400 },
    );
  }

  try {
    const cfg = await getTenantCompanyConfig(tenantId);

    return NextResponse.json({
      commercialName: cfg.commercialName,
      brandingLogoWhite: cfg.brandingLogoWhite,
      brandingLogoIcon: cfg.brandingLogoIcon,
      brandingPrimaryColor: cfg.brandingPrimaryColor,
      brandingAppName: cfg.brandingAppName,
    });
  } catch {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
}
