/** POST /api/crm/correos/[threadId]/vertical — corrige la vertical del hilo. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { auditEmailAction } from "@/lib/audit-email";
import {
  VERTICAL_CAPABILITY,
  VERTICAL_META,
  effectiveVertical,
  visibleVertical,
  type RadarCapability,
  type RadarVertical,
} from "@/modules/crm/email/radar-types";

type Ctx = { params: Promise<{ threadId: string }> };
type Body = { vertical?: RadarVertical | null };

const ASSIGNABLE = new Set(Object.keys(VERTICAL_META));

export async function POST(req: NextRequest, ctx: Ctx) {
  const mod = await requireCorreosAccess("edit");
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId: session.user.id, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });

  const { threadId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Body;

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: { id: true, aiVertical: true, verticalOverride: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const wantsClear = body.vertical === null;
  const raw = body.vertical;

  if (!wantsClear) {
    if (typeof raw !== "string" || !ASSIGNABLE.has(raw) || raw === "otro") {
      return NextResponse.json({ error: "Vertical inválida" }, { status: 400 });
    }
    const cap = VERTICAL_CAPABILITY[raw as RadarVertical];
    if (!cap) {
      return NextResponse.json({ error: "Vertical inválida" }, { status: 400 });
    }
    const perms = await resolveApiPerms(mod.ctx);
    if (!hasCapability(perms, cap)) {
      return NextResponse.json(
        { error: "Sin capability para esa vertical" },
        { status: 403 },
      );
    }
  }

  const from = effectiveVertical(thread.aiVertical, thread.verticalOverride);
  const to = wantsClear ? null : (raw as RadarVertical);

  await prisma.crmEmailThread.update({
    where: { id: thread.id },
    data: wantsClear
      ? {
          verticalOverride: null,
          verticalOverrideById: null,
          verticalOverrideAt: null,
        }
      : {
          verticalOverride: to,
          verticalOverrideById: session.user.id,
          verticalOverrideAt: new Date(),
        },
  });

  void auditEmailAction({
    tenantId,
    userId: session.user.id,
    userEmail: session.user.email,
    action: "verticalOverride",
    entityType: "email_thread",
    entityId: thread.id,
    meta: { from, to },
  });

  const perms = await resolveApiPerms(mod.ctx);
  const caps = new Set<RadarCapability>(
    (["radar_comercial", "radar_operaciones", "radar_rrhh", "radar_finanzas"] as const).filter(
      (c) => hasCapability(perms, c),
    ),
  );
  const vertical = visibleVertical(
    effectiveVertical(thread.aiVertical, wantsClear ? null : to),
    caps,
  );

  return NextResponse.json({
    ok: true,
    vertical,
    verticalFixed: !wantsClear,
  });
}
