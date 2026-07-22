import { NextRequest, NextResponse } from "next/server";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import { getUsersBusy } from "@/modules/calendar/calendar-availability";
import { suggestCommonFreeSlots } from "@/modules/calendar/calendar-intervals";

/**
 * GET /api/calendar/availability?userIds=a,b&from=ISO&to=ISO&duration=60
 * Busy slots por usuario (v2 + legacy + Google freebusy best-effort) y hasta
 * 4 sugerencias de horario común libre dentro de 08–19 Chile.
 */
export async function GET(request: NextRequest) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;

  const { searchParams } = new URL(request.url);
  const userIds = (searchParams.get("userIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  const from = new Date(searchParams.get("from") ?? "");
  const to = new Date(searchParams.get("to") ?? "");
  const duration = Math.max(15, Math.min(480, Number(searchParams.get("duration")) || 60));

  if (!userIds.length || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json(
      { error: "userIds, from y to son requeridos" },
      { status: 400 },
    );
  }

  const users = await getUsersBusy(ctx.tenantId, userIds, from, to);
  const suggestions = suggestCommonFreeSlots(
    users.map((u) => u.busy),
    from,
    duration,
    4,
  );

  return NextResponse.json({
    users: users.map((u) => ({
      userId: u.userId,
      busy: u.busy.map((b) => ({
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        title: b.title ?? null,
      })),
    })),
    suggestions: suggestions.map((s) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
    })),
  });
}
