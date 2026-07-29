/** POST /api/crm/correos/[threadId]/recalc-staffing — recálculo determinista (sin IA). */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { coerceCrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.service";
import type { CrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.types";

type Ctx = { params: Promise<{ threadId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const authCtx = mod.ctx;

  const perms = await resolveApiPerms(authCtx);
  if (!hasCapability(perms, "copiloto_correos")) {
    return NextResponse.json({ error: "Sin permiso de Radar Comercial" }, { status: 403 });
  }

  const { threadId } = await ctx.params;
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId: authCtx.tenantId },
    select: { id: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { proposal?: CrmStructureProposal };
  if (!body.proposal) {
    return NextResponse.json({ error: "Falta la propuesta" }, { status: 400 });
  }

  const proposal = coerceCrmStructureProposal(body.proposal);
  return NextResponse.json({
    proposal,
    staffingTotals: proposal.staffingTotals,
  });
}
