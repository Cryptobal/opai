import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { AIError } from "@/lib/ai-errors";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string };

type SectionPayload = {
  title: string;
  icon: string;
  items: Array<{ title: string; description: string }>;
};

const EXTRACTION_PROMPT = `Analiza este documento de protocolos de seguridad y extrae toda la información organizándola en secciones con ítems detallados.
Responde ÚNICAMENTE con el siguiente JSON válido, sin markdown, sin backticks:
{"sections":[{"title":"...","icon":"emoji","items":[{"title":"...","description":"..."}]}]}
Estructura toda la información del documento en secciones claras. Si hay información confusa, organízala lo mejor posible.`;

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

    const { id } = await params;

    const formData = await request.formData();
    const files = formData.getAll("files");

    if (!files.length) {
      return NextResponse.json(
        { success: false, error: "No se recibieron archivos PDF" },
        { status: 400 },
      );
    }

    const allSections: SectionPayload[] = [];

    for (const file of files) {
      if (!(file instanceof File)) continue;

      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");

      let result: { sections: SectionPayload[] };
      try {
        result = (await aiService.processDocument(base64, EXTRACTION_PROMPT, 4096)) as typeof result;
      } catch (err: unknown) {
        if (err instanceof AIError) {
          return NextResponse.json(err.toResponse(), { status: err.clientHttpStatus });
        }
        if (err instanceof Error && err.message === "NO_AI_CONFIGURED") {
          return NextResponse.json(
            { success: false, error: "NO_AI_CONFIGURED", message: "No hay un proveedor de IA configurado. Configura uno en Ajustes > IA." },
            { status: 400 },
          );
        }
        throw err;
      }

      if (result?.sections?.length) {
        allSections.push(...result.sections);
      }
    }

    if (!allSections.length) {
      return NextResponse.json(
        { success: false, error: "No se pudo extraer información de los PDFs" },
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
      allSections.map((section, sIdx) =>
        prisma.protocolSection.create({
          data: {
            installationId: id,
            title: section.title,
            icon: section.icon || "📄",
            order: sIdx,
            items: {
              create: (section.items || []).map((item, iIdx) => ({
                title: item.title,
                description: item.description,
                order: iIdx,
                source: "ai_from_pdf",
              })),
            },
          },
          include: { items: { orderBy: { order: "asc" } } },
        }),
      ),
    );

    return NextResponse.json({ success: true, data: { sections: created } });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(error.toResponse(), { status: error.clientHttpStatus });
    }
    console.error("[PROTOCOL_EXTRACT_PDF] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al extraer protocolo del PDF", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
