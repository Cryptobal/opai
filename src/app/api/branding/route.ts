import { NextResponse } from "next/server";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { getDefaultTenantId } from "@/lib/tenant";

/**
 * GET /api/branding — Public branding config (no auth required)
 * Returns branding fields for the default tenant.
 * Used by /welcome and other public pages.
 */
export async function GET() {
  try {
    const tenantId = await getDefaultTenantId();
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
    // Return generic OPAI defaults on error so welcome screen always works
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
