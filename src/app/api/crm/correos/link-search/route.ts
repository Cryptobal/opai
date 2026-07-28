/** GET /api/crm/correos/link-search?type=&q=&accountId= — candidatos del picker de vínculos. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import {
  isThreadLinkEntityType,
  searchThreadLinkCandidates,
} from "@/modules/crm/email/email-thread-links";

export async function GET(req: NextRequest) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const type = req.nextUrl.searchParams.get("type") ?? "";
  if (!isThreadLinkEntityType(type)) {
    return NextResponse.json({ error: "type inválido" }, { status: 400 });
  }
  const accountId = req.nextUrl.searchParams.get("accountId");
  const result = await searchThreadLinkCandidates({
    tenantId: session.user.tenantId,
    type,
    q: req.nextUrl.searchParams.get("q") ?? "",
    accountId,
  });
  return NextResponse.json(result);
}
