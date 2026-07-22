import { NextRequest, NextResponse } from "next/server";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import { getDealCommunications } from "@/modules/agenda/deal-communications";

type Ctx = { params: Promise<{ dealId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { dealId } = await ctx.params;
  const data = await getDealCommunications(access.ctx.tenantId, dealId);
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json({
    emails: data.emails.slice(0, 5),
    quotes: data.quotes,
    notes: data.notes,
    checklist: {
      cotizacion: data.quotes.length > 0,
      correos: data.emails.length > 0,
      bases: data.emails.some((e) => e.extracto.length > 0),
    },
  });
}
