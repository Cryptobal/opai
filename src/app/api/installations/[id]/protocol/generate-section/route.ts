import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aiService } from "@/lib/ai-service";
import { AIError } from "@/lib/ai-errors";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string };

const bodySchema = z.object({
  description: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para editar protocolos" },
        { status: 403 },
      );
    }

    await params;

    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { description } = parsed.data;

    const prompt = `Para un protocolo de seguridad de una empresa de guardias en Chile, genera una sección completa sobre: "${description}"
Responde ÚNICAMENTE con el siguiente JSON válido: {"title":"...","icon":"emoji","items":[{"title":"...","description":"..."}]}
Incluye al menos 4 ítems detallados, prácticos y accionables.`;

    let aiResponse: { title: string; icon: string; items: Array<{ title: string; description: string }> };
    try {
      aiResponse = (await aiService.generateJSON(prompt, 4096)) as typeof aiResponse;
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "NO_AI_CONFIGURED") {
        return NextResponse.json(
          { success: false, error: "NO_AI_CONFIGURED", message: "No hay un proveedor de IA configurado. Configura uno en Ajustes > IA." },
          { status: 400 },
        );
      }
      throw err;
    }

    if (!aiResponse?.title || !aiResponse?.items?.length) {
      return NextResponse.json(
        { success: false, error: "La IA no generó una sección válida" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: { section: aiResponse } });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(error.toResponse(), { status: error.clientHttpStatus });
    }
    console.error("[PROTOCOL_GENERATE_SECTION] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar sección con IA", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
