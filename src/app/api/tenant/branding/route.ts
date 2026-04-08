import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { auth } from "@/lib/auth";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { getDeviceFromToken } from "@/lib/device-auth";

/**
 * Returns public-facing branding for the caller's tenant.
 *
 * The tenantId is NEVER taken from the request body or query string —
 * it is always resolved server-side from whatever authentication signal
 * the caller provides. This prevents any client from enumerating
 * branding across tenants.
 *
 * Resolution order:
 *   1. NextAuth session (admin / supervisor ERP)
 *   2. portal_cliente_session cookie (client portal)
 *   3. Authorization: Bearer <device_token> (paired Terreno devices)
 *   4. No signal → OPAI defaults (not an error)
 *
 * The response only contains branding (commercial name, logos, primary
 * color, app name). No financial, operational, or configuration data.
 */

const OPAI_DEFAULTS = {
  commercialName: "OPAI",
  brandingLogoWhite: "",
  brandingLogoIcon: "",
  brandingPrimaryColor: "#0a1628",
  brandingAppName: "OPAI",
};

export async function GET(request: NextRequest) {
  const tenantId = await resolveTenantIdFromCaller(request);

  // No signal → OPAI defaults (lets generic /welcome and unauthenticated
  // hubs render cleanly without having to special-case a 404).
  if (!tenantId) {
    return NextResponse.json(OPAI_DEFAULTS);
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
    return NextResponse.json(OPAI_DEFAULTS);
  }
}

async function resolveTenantIdFromCaller(
  request: NextRequest,
): Promise<string | null> {
  // 1. NextAuth session (ERP admin, supervisor)
  try {
    const session = await auth();
    const tenantId = (session?.user as { tenantId?: string } | undefined)
      ?.tenantId;
    if (tenantId) return tenantId;
  } catch {
    /* ignore — fall through */
  }

  // 2. Portal cliente cookie
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get("portal_cliente_session")?.value;
    const session = parsePortalClienteSessionCookie(raw);
    if (session?.tenantId) return session.tenantId;
  } catch {
    /* ignore — fall through */
  }

  // 3. Device bearer token (Terreno paired devices)
  try {
    const device = await getDeviceFromToken(request);
    if (device?.tenantId) return device.tenantId;
  } catch {
    /* ignore — fall through */
  }

  return null;
}
