import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { aiService } from "@/lib/ai-service";
import { getDealCommunications } from "@/modules/agenda/deal-communications";

type Ctx = { params: Promise<{ dealId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { dealId } = await ctx.params;
  const data = await getDealCommunications(session.user.tenantId, dealId);
  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (data.emails.length === 0 && data.quotes.length === 0) {
    return NextResponse.json({ summary: "Sin comunicaciones registradas" });
  }

  const prompt = [
    `Resumen ejecutivo de la licitación "${data.deal.title}" en ≤3 frases + pendientes concretos.`,
    "No inventes datos. Usa solo el contexto:",
    `Correos: ${JSON.stringify(data.emails.slice(0, 10))}`,
    `Cotizaciones: ${JSON.stringify(data.quotes)}`,
    `Notas: ${JSON.stringify(data.notes)}`,
  ].join("\n");

  const summary = await aiService.generateText(
    prompt,
    { maxTokens: 400, temperature: 0.2 },
    { tenantId: session.user.tenantId },
  );

  return NextResponse.json({ summary });
}
