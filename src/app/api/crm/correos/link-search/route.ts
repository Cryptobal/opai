/**
 * GET /api/crm/correos/link-search?type=installation&q=… (O01):
 * candidatos tenant-scoped para el picker de vinculación del hilo.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantModule } from "@/lib/require-module";
import {
  isThreadLinkEntityType,
  searchThreadLinkCandidates,
} from "@/modules/crm/email/email-thread-links";

export async function GET(req: NextRequest) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const type = req.nextUrl.searchParams.get("type") ?? "";
  if (!isThreadLinkEntityType(type)) {
    return NextResponse.json({ error: "type inválido" }, { status: 400 });
  }
  const candidates = await searchThreadLinkCandidates({
    tenantId: session.user.tenantId,
    type,
    q: req.nextUrl.searchParams.get("q") ?? "",
  });
  return NextResponse.json({ candidates });
}
