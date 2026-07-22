/** GET /api/crm/correos/recipients?q= — autocompletado To/CC/BCC (C21a).
 * Merge de contactos CRM del tenant + frecency propia del usuario; ≤8 ítems.
 * Con q vacío devuelve los frecuentes (precarga del caché local del cliente). */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantModule } from "@/lib/require-module";
import { suggestRecipients } from "@/modules/crm/email/email-recipients";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 25) : 8;

  const items = await suggestRecipients(q, {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    limit,
  });

  return NextResponse.json({ items });
}
