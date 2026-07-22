import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listAgenda } from "@/modules/agenda/agenda.service";
import { listGoogleCalendarEvents } from "@/modules/agenda/google-events";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const [opai, google] = await Promise.all([
    listAgenda(session.user.tenantId, from, to, session.user.id),
    listGoogleCalendarEvents(session.user.tenantId, session.user.id, from, to),
  ]);
  const items = [...opai, ...google.items].sort((a, b) => a.start.localeCompare(b.start));
  return NextResponse.json({ items, googleStatus: google.status });
}
