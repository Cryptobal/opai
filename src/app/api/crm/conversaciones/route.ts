/**
 * GET /api/crm/conversaciones?entityType=&entityId=&cascade=1
 *
 * Lista hilos VISIBLES en la ficha de una entidad. Acceso derivado de la
 * entidad (no del dueño de la casilla). Compatibilidad: accountId / dealId /
 * installationId siguen aceptándose (deprecados) y se traducen a la forma nueva.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, resolveApiPerms } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  legacyParamsToEntity,
  resolveEntityConversations,
} from "@/modules/crm/email/entity-conversations";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const perms = await resolveApiPerms(ctx);

  const sp = req.nextUrl.searchParams;
  const resolved = legacyParamsToEntity({
    accountId: sp.get("accountId"),
    dealId: sp.get("dealId"),
    installationId: sp.get("installationId"),
    entityType: sp.get("entityType"),
    entityId: sp.get("entityId"),
  });
  if (!resolved) {
    return NextResponse.json(
      { error: "Falta entityType/entityId (o accountId/dealId/installationId)" },
      { status: 400 },
    );
  }

  const cascadeParam = sp.get("cascade");
  const cascade = cascadeParam === null || cascadeParam === "1" || cascadeParam === "true";

  const result = await resolveEntityConversations({
    prisma,
    tenantId: ctx.tenantId,
    perms,
    entityType: resolved.entityType,
    entityId: resolved.entityId,
    cascade,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ threads: result.threads });
}
