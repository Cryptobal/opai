import { NextResponse } from "next/server";
import { requireDtTenantSession, type DtSession } from "@/lib/fiscalizacion-dt/session";

export async function requireMatchingDtTenant(
  urlTenantId: string,
): Promise<{ session: DtSession & { tenantId: string } } | { error: NextResponse }> {
  const session = await requireDtTenantSession();
  if (!session) {
    return {
      error: NextResponse.json({ success: false, error: "Sesión expirada" }, { status: 401 }),
    };
  }
  if (session.tenantId !== urlTenantId) {
    return {
      error: NextResponse.json(
        { success: false, error: "El empleador no coincide con la sesión de fiscalización" },
        { status: 403 },
      ),
    };
  }
  return { session };
}
