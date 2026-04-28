import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aiService } from "@/lib/ai-service";
import { AIError } from "@/lib/ai-errors";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string };

const bodySchema = z.object({
  sectionTitle: z.string().min(1),
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
    const { sectionTitle, description } = parsed.data;

    const prompt = `Dentro de la sección "${sectionTitle}" de un protocolo de seguridad para una empresa de guardias en Chile, genera un procedimiento detallado sobre: "${description}"
Responde ÚNICAMENTE con el siguiente JSON válido: {"title":"...","description":"..."}
El título debe ser conciso y la descripción detallada, práctica y accionable.`;

    let aiResponse: { title: string; description: string };
    try {
      aiResponse = (await aiService.generateJSON(prompt, 2048)) as typeof aiResponse;
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "NO_AI_CONFIGURED") {
        return NextResponse.json(
          { success: false, error: "NO_AI_CONFIGURED", message: "No hay un proveedor de IA configurado. Configura uno en Ajustes > IA." },
          { status: 400 },
        );
      }
      throw err;
    }

    if (!aiResponse?.title || !aiResponse?.description) {
      return NextResponse.json(
        { success: false, error: "La IA no generó un ítem válido" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: { item: aiResponse } });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(error.toResponse(), { status: error.clientHttpStatus });
    }
    console.error("[PROTOCOL_GENERATE_ITEM] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar ítem con IA", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
