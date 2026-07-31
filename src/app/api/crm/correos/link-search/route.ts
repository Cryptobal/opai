/** GET /api/crm/correos/link-search?type=&types=&q=&accountId=&dealId= — candidatos del omnibox. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import {
  isOmniboxEntityType,
  isThreadLinkEntityType,
  searchThreadLinkCandidates,
  searchThreadLinkCandidatesMulti,
} from "@/modules/crm/email/email-thread-links";
import { findOwnCompanyAccountIds } from "@/modules/crm/email/own-tenant-company";

export async function GET(req: NextRequest) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;
  const accountId = req.nextUrl.searchParams.get("accountId");
  const dealId = req.nextUrl.searchParams.get("dealId");
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const typesParam = req.nextUrl.searchParams.get("types");
  const type = req.nextUrl.searchParams.get("type") ?? "";

  // La cuenta de la propia empresa del tenant no es asociable a correos.
  const ownIds = new Set(await findOwnCompanyAccountIds(tenantId));

  if (typesParam) {
    const types = typesParam
      .split(",")
      .map((t) => t.trim())
      .filter((t) => isOmniboxEntityType(t) || isThreadLinkEntityType(t));
    if (types.length === 0) {
      return NextResponse.json({ error: "types inválidos" }, { status: 400 });
    }
    const result = await searchThreadLinkCandidatesMulti({
      tenantId,
      types,
      q,
      accountId,
      dealId,
    });
    return NextResponse.json({
      ...result,
      candidates: result.candidates.filter(
        (c) => !(c.entityType === "account" && ownIds.has(c.id)),
      ),
    });
  }

  if (!isThreadLinkEntityType(type)) {
    return NextResponse.json({ error: "type inválido" }, { status: 400 });
  }
  const result = await searchThreadLinkCandidates({
    tenantId,
    type,
    q,
    accountId,
    dealId,
  });
  // type aquí es ThreadLinkEntityType (no "account"); sin filtro ownIds.
  return NextResponse.json({
    ...result,
    candidates: result.candidates.map((c) => ({ ...c, entityType: type })),
  });
}
