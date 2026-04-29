import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { aiService } from "@/lib/ai-service";
import { logAiUsage } from "@/lib/platform-ai-service";
import {
  buildInstallationContext,
  buildFindingsContext,
  buildPhotosContext,
} from "@/lib/vra/context-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST /api/vra/reports/[id]/sections/[sectionId]/regenerate
 * Re-genera UNA sección con la IA (sin re-correr todo el pipeline).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id, sectionId } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        sections: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    const section = report.sections.find((s) => s.id === sectionId);
    if (!section) {
      return NextResponse.json({ success: false, error: "Sección no encontrada" }, { status: 404 });
    }

    const template = await prisma.vraSectionTemplate.findFirst({
      where: { id: section.templateId ?? "", tenantId: ctx.tenantId },
    });
    if (!template) {
      return NextResponse.json({ success: false, error: "Plantilla original no encontrada" }, { status: 400 });
    }

    const installation = await buildInstallationContext(report.installationId, ctx.tenantId);
    const findings = await buildFindingsContext(
      report.installationId,
      ctx.tenantId,
      report.visitId,
      report.id,
    );
    const photos = await buildPhotosContext(
      report.installationId,
      ctx.tenantId,
      report.visitId,
      report.id,
    );

    const previousSections: Record<string, unknown> = {};
    for (const s of report.sections) {
      if (s.id !== sectionId && s.contentJson) {
        previousSections[s.key] = s.contentJson;
      }
    }

    const dataInputs = (template.dataInputs as string[]) ?? [];
    const ctxFiltered: Record<string, unknown> = {};
    for (const input of dataInputs) {
      if (input === "installation") ctxFiltered.installation = installation;
      else if (input === "findings") ctxFiltered.findings = findings;
      else if (input === "photos") ctxFiltered.photos = photos;
      else if (input.startsWith("previous_section:")) {
        const key = input.split(":")[1];
        if (previousSections[key]) {
          ctxFiltered[`previous_section_${key}`] = previousSections[key];
        }
      }
    }

    const prompt = `Eres el Director de Operaciones de Seguridad de Gard Security.

Re-genera la sección "${template.title}" del informe de vulnerabilidad.

INSTRUCCIONES:
${template.description}

${template.aiPromptHint ? `INSTRUCCIONES ADICIONALES:\n${template.aiPromptHint}\n` : ""}

TIPO DE BLOQUE DE SALIDA: ${template.outputType}

CONTEXTO:
${JSON.stringify(ctxFiltered, null, 2)}

Devuelve SOLO el JSON con la estructura adecuada al outputType.`;

    await prisma.vraReportSection.update({
      where: { id: sectionId },
      data: { status: "generating" },
    });

    const t0 = Date.now();
    const contentJson = await aiService.generateJSON(prompt, 4096, { tenantId: ctx.tenantId });

    logAiUsage({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      providerType: "auto",
      model: "tenant-default",
      feature: "vra_section_regenerate",
      durationMs: Date.now() - t0,
      metadata: { sectionKey: section.key },
    });

    const updated = await prisma.vraReportSection.update({
      where: { id: sectionId },
      data: {
        contentJson: contentJson as unknown as object,
        status: "generated",
        generatedAt: new Date(),
        errorMessage: null,
      },
    });

    return NextResponse.json({ success: true, section: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] regenerate section error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
