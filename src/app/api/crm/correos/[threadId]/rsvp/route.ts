/**
 * POST /api/crm/correos/[threadId]/rsvp
 * Acepta / quizás / rechaza una invitación del mensaje vía Google Calendar.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { resolveCorreoInvite } from "@/modules/crm/email/correo-invite";
import { respondGoogleInviteRsvp } from "@/modules/calendar/calendar-rsvp-google";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  messageId: z.string().min(1),
  response: z.enum(["accepted", "tentative", "declined"]),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireCorreosAccess("edit");
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { threadId } = await ctx.params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  const { messageId, response } = parsed.data;

  const inviteRes = await resolveCorreoInvite({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    threadId,
    messageId,
  });
  if (!inviteRes.ok) {
    return NextResponse.json({ error: inviteRes.error }, { status: inviteRes.status });
  }
  const invite = inviteRes.invite;
  if (invite.cancelled) {
    return NextResponse.json({ error: "La invitación fue cancelada" }, { status: 400 });
  }
  if (!invite.uid) {
    return NextResponse.json({ error: "La invitación no tiene UID" }, { status: 400 });
  }

  const result = await respondGoogleInviteRsvp({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    icalUid: invite.uid,
    response,
  });

  if (!result.ok) {
    const status =
      result.code === "calendar_disconnected"
        ? 400
        : result.code === "event_not_found"
          ? 404
          : result.code === "not_attendee"
            ? 403
            : 502;
    return NextResponse.json({ ok: false, code: result.code, error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    responseStatus: result.responseStatus,
    googleEventId: result.googleEventId,
    googleHtmlLink: result.htmlLink,
    opaiEventId: result.opaiEventId,
  });
}
