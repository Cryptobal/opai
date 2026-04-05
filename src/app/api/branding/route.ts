import { NextRequest, NextResponse } from "next/server";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { auth } from "@/lib/auth";
import { resolveTenantFromSlug } from "@/lib/tenant";

/**
 * GET /api/branding — Public branding config
 * Resolves tenant from: ?tenant=slug > session.user.tenantId > generic OPAI defaults
 */
export async function GET(req: NextRequest) {
  try {
    let tenantId: string | null = null;

    // 1. Try tenant slug from query param
    const slug = req.nextUrl.searchParams.get("tenant");
    if (slug) {
      const tenant = await resolveTenantFromSlug(slug);
      if (tenant) tenantId = tenant.id;
    }

    // 2. Try session
    if (!tenantId) {
      const session = await auth();
      tenantId = session?.user?.tenantId ?? null;
    }

    // 3. If no tenant resolved, return generic OPAI defaults
    if (!tenantId) {
      return NextResponse.json({
        success: true,
        data: {
          logoFull: "",
          logoIcon: "",
          logoWhite: "",
          logoDark: "",
          favicon: "",
          primaryColor: "#0056E0",
          secondaryColor: "#1DB990",
          accentColor: "#FF6B35",
          appName: "OPAI",
          tagline: "Plataforma de Gestión de Seguridad",
          companyName: "OPAI",
        },
      });
    }

    const config = await getTenantCompanyConfig(tenantId);

    return NextResponse.json({
      success: true,
      data: {
        logoFull: config.brandingLogoFull || config.logoUrl || "",
        logoIcon: config.brandingLogoIcon || "",
        logoWhite: config.brandingLogoWhite || "",
        logoDark: config.brandingLogoDark || "",
        favicon: config.brandingFavicon || "",
        primaryColor: config.brandingPrimaryColor,
        secondaryColor: config.brandingSecondaryColor,
        accentColor: config.brandingAccentColor,
        appName: config.brandingAppName,
        tagline: config.brandingTagline,
        companyName: config.commercialName || config.companyName,
        brandNameUpper: config.brandNameUpper,
        website: config.website,
        contactEmail: config.email,
      },
    });
  } catch (error) {
    console.error("[BRANDING] Error loading public branding:", error);
    return NextResponse.json({
      success: true,
      data: {
        logoFull: "",
        logoIcon: "",
        logoWhite: "",
        logoDark: "",
        favicon: "",
        primaryColor: "#0056E0",
        secondaryColor: "#1DB990",
        accentColor: "#FF6B35",
        appName: "OPAI",
        tagline: "Plataforma de Gestión de Seguridad",
        companyName: "OPAI",
      },
    });
  }
}
