/** GET /api/crm/correos/[threadId] — detalle de un hilo (cuerpos + adjuntos). */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { getCorreoDetail } from "@/modules/crm/email/correos-detail";
import type { RadarCapability } from "@/modules/crm/email/radar-types";

type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
    select: { id: true },
  });
  if (!account) {
    return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });
  }

  const perms = await resolveApiPerms(mod.ctx);
  const radarCaps = new Set<RadarCapability>(
    (["radar_comercial", "radar_operaciones", "radar_rrhh", "radar_finanzas"] as const).filter(
      (c) => hasCapability(perms, c),
    ),
  );

  const { threadId } = await ctx.params;
  const detail = await getCorreoDetail({
    tenantId: session.user.tenantId,
    emailAccountId: account.id,
    threadId,
    radarCaps,
  });
  if (!detail) {
    return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
