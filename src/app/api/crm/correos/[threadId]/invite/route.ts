/**
 * GET /api/crm/correos/[threadId]/invite?messageId=
 * Resuelve la invitación ICS del mensaje (si existe) + estado RSVP en Google.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { resolveCorreoInvite } from "@/modules/crm/email/correo-invite";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireCorreosAccess("view");
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { threadId } = await ctx.params;
  const messageId = req.nextUrl.searchParams.get("messageId")?.trim();
  if (!messageId) {
    return NextResponse.json({ error: "messageId requerido" }, { status: 400 });
  }

  const result = await resolveCorreoInvite({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    threadId,
    messageId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, invite: result.invite });
}
