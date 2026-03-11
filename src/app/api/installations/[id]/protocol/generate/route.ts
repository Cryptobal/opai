import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string };

const installationTypeLabels: Record<string, string> = {
  condominio: "Condominio residencial",
  edificio_corporativo: "Edificio corporativo",
  mall_retail: "Centro comercial / Retail",
  bodega_industria: "Bodega e industria",
  obra_construccion: "Obra en construcción",
  educacional: "Recinto educacional",
};

const bodySchema = z.object({
  installationType: z.enum([
    "condominio",
    "edificio_corporativo",
    "mall_retail",
    "bodega_industria",
    "obra_construccion",
    "educacional",
  ]),
  context: z.string().optional(),
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

    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { installationType, context } = parsed.data;

    const { id } = await params;
    const typeLabel = installationTypeLabels[installationType];

    const prompt = `Eres un experto en seguridad privada en Chile. Genera un protocolo de seguridad completo para un/a ${typeLabel}.
${context ? `Contexto adicional: ${context}` : ""}
Responde ÚNICAMENTE con el siguiente JSON válido, sin markdown, sin backticks, sin texto adicional:
{"sections":[{"title":"...","icon":"emoji","items":[{"title":"...","description":"..."}]}]}
Incluye mínimo estas áreas: Control de Acceso, Rondas de Seguridad, Emergencias, Apertura y Cierre, Registro de Visitas, Equipamiento del Guardia, Normas Específicas del lugar.
Cada ítem debe ser detallado, práctico y accionable para un guardia de seguridad.`;

    let aiResponse: { sections: Array<{ title: string; icon: string; items: Array<{ title: string; description: string }> }> };
    try {
      aiResponse = (await aiService.generateJSON(prompt, 4096)) as typeof aiResponse;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[PROTOCOL_GENERATE] AI error:", msg);
      if (msg === "NO_AI_CONFIGURED") {
        return NextResponse.json(
          { success: false, error: "NO_AI_CONFIGURED", message: "No hay un proveedor de IA configurado. Configura uno en Ajustes > IA." },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { success: false, error: msg, message: `Error del proveedor de IA: ${msg}` },
        { status: 502 },
      );
    }

    if (!aiResponse?.sections?.length) {
      return NextResponse.json(
        { success: false, error: "La IA no generó secciones válidas" },
        { status: 500 },
      );
    }

    await prisma.protocolItem.deleteMany({
      where: { section: { installationId: id } },
    });
    await prisma.protocolSection.deleteMany({
      where: { installationId: id },
    });

    const created = await prisma.$transaction(
      aiResponse.sections.map((section, sIdx) =>
        prisma.protocolSection.create({
          data: {
            installationId: id,
            title: section.title,
            icon: section.icon || "📋",
            order: sIdx,
            items: {
              create: (section.items || []).map((item, iIdx) => ({
                title: item.title,
                description: item.description,
                order: iIdx,
                source: "ai_generated",
              })),
            },
          },
          include: { items: { orderBy: { order: "asc" } } },
        }),
      ),
    );

    return NextResponse.json({ success: true, data: { sections: created } });
  } catch (error) {
    console.error("[PROTOCOL_GENERATE] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar protocolo con IA" },
      { status: 500 },
    );
  }
}
