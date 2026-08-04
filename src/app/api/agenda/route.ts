import { NextRequest, NextResponse } from "next/server";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import { listAgenda } from "@/modules/agenda/agenda.service";
import { listGoogleCalendarEvents } from "@/modules/agenda/google-events";

export async function GET(request: NextRequest) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;

  const { searchParams } = new URL(request.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  if (!fromStr || !toStr) {
    return NextResponse.json({ error: "from y to requeridos" }, { status: 400 });
  }

  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "fechas inválidas" }, { status: 400 });
  }

  const dealId = searchParams.get("dealId");

  const [opai, google] = await Promise.all([
    listAgenda(
      ctx.tenantId,
      from,
      to,
      dealId ? undefined : ctx.userId,
      dealId ? { dealId } : undefined,
    ),
    dealId
      ? Promise.resolve({ items: [], status: "skipped" as const })
      : listGoogleCalendarEvents(ctx.tenantId, ctx.userId, from, to),
  ]);
  const items = [...opai, ...google.items].sort((a, b) => a.start.localeCompare(b.start));
  return NextResponse.json({ items, googleStatus: google.status });
}
