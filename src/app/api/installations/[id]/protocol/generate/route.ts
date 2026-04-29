import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { AIError } from "@/lib/ai-errors";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { clearKnowledgeCache } from "@/lib/protocols/knowledge-aggregator";
import { canEdit } from "@/lib/permissions";
import {
  getAiKnowledgeSources,
  rankSourcesForPrompt,
} from "@/lib/protocols/ai-knowledge-sources";
import { buildGenerateProtocolPrompt } from "@/lib/protocols/prompts";

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

type ProtocolAiResponse = {
  sections: Array<{
    title: string;
    icon: string;
    items: Array<{
      title: string;
      description: string;
      criticality?: number;
      legalRequirement?: boolean;
    }>;
  }>;
};

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

    const [installation, sources] = await Promise.all([
      prisma.crmInstallation.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: { account: true },
      }),
      getAiKnowledgeSources({ tenantId: ctx.tenantId, installationId: id }),
    ]);

    const prompt = buildGenerateProtocolPrompt({
      installationTypeLabel: installationTypeLabels[installationType],
      installationName: installation?.name ?? null,
      installationAddress: installation?.address ?? null,
      installationDescription: installation?.notes ?? null,
      accountName: installation?.account?.name ?? null,
      accountIndustria: installation?.account?.industry ?? null,
      freeContext: context ?? null,
      hasGroundingDocuments: sources.length > 0,
    });

    let aiResponse: ProtocolAiResponse;
    try {
      if (sources.length > 0) {
        // Tomamos el PDF de mayor prioridad como ancla. Multi-doc requiere
        // soporte específico del provider; para mantener la compatibilidad
        // actual usamos un solo PDF de referencia y dejamos que el resto
        // del contexto (CRM + normativa) lo aporte el prompt.
        const ranked = rankSourcesForPrompt(sources);
        const anchor = ranked[0];
        const pdfRes = await fetch(anchor.fileUrl);
        if (!pdfRes.ok) throw new Error(`PDF fetch ${pdfRes.status}`);
        const pdfBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString(
          "base64",
        );
        aiResponse = (await aiService.processDocument(pdfBase64, prompt, 4096, {
          tenantId: ctx.tenantId,
        })) as ProtocolAiResponse;
      } else {
        aiResponse = (await aiService.generateJSON(prompt, 4096, {
          tenantId: ctx.tenantId,
        })) as ProtocolAiResponse;
      }
    } catch (err: unknown) {
      if (err instanceof AIError) {
        return NextResponse.json(err.toResponse(), { status: err.clientHttpStatus });
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[PROTOCOL_GENERATE] AI error:", msg);
      if (msg === "NO_AI_CONFIGURED") {
        return NextResponse.json(
          {
            success: false,
            error: "NO_AI_CONFIGURED",
            message:
              "No hay un proveedor de IA configurado. Configura uno en Ajustes > IA.",
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: msg,
          message: `Error del proveedor de IA: ${msg}`,
        },
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
                criticality:
                  typeof item.criticality === "number" &&
                  item.criticality >= 1 &&
                  item.criticality <= 3
                    ? Math.round(item.criticality)
                    : 1,
                legalRequirement: !!item.legalRequirement,
              })),
            },
          },
          include: { items: { orderBy: { order: "asc" } } },
        }),
      ),
    );

    clearKnowledgeCache(ctx.tenantId);

    return NextResponse.json({
      success: true,
      data: {
        sections: created,
        groundingSources: sources.map((s) => ({
          id: s.id,
          fileName: s.fileName,
          tipoNombre: s.tipoNombre,
          scope: s.scope,
        })),
      },
    });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(error.toResponse(), {
        status: error.clientHttpStatus,
      });
    }
    console.error("[PROTOCOL_GENERATE] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar protocolo con IA", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
