import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  contentJson: z.unknown().optional(),
  status: z.enum(["edited", "skipped", "generated"]).optional(),
});

/**
 * PUT /api/vra/reports/[id]/sections/[sectionId]
 * Permite al usuario editar manualmente el contenido de una sección o saltarla.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id, sectionId } = await params;

    const parsed = await parseBody(request, updateSchema);
    if (parsed.error) return parsed.error;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    const section = await prisma.vraReportSection.findFirst({
      where: { id: sectionId, reportId: id },
    });
    if (!section) {
      return NextResponse.json({ success: false, error: "Sección no encontrada" }, { status: 404 });
    }

    const updated = await prisma.vraReportSection.update({
      where: { id: sectionId },
      data: {
        contentJson:
          parsed.data.contentJson === undefined
            ? undefined
            : (parsed.data.contentJson as unknown as object),
        status: parsed.data.status ?? "edited",
      },
    });

    return NextResponse.json({ success: true, section: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
