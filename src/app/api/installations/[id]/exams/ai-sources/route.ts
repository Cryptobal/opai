import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { getAiKnowledgeSources } from "@/lib/protocols/ai-knowledge-sources";

type Params = { id: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);

  if (!canView(perms, "crm", "installations")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const sources = await getAiKnowledgeSources({
    tenantId: ctx.tenantId,
    installationId: id,
  });
  return NextResponse.json({ success: true, data: sources });
}
