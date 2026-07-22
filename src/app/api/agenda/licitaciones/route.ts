import { NextResponse } from "next/server";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import { listLicitacionesEnCarpeta } from "@/modules/agenda/agenda.service";

export async function GET() {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const items = await listLicitacionesEnCarpeta(access.ctx.tenantId);
  return NextResponse.json({ items });
}
