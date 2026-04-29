import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const SEVERITY_VALUES = ["critical", "high", "medium", "low"] as const;

const updateSchema = z.object({
  description: z.string().min(3).max(2000).optional(),
  severity: z.enum(SEVERITY_VALUES).optional(),
  location: z.string().max(200).optional().nullable(),
  sectorTag: z.string().max(80).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  aggravatingFactors: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

/**
 * PUT /api/vra/reports/[id]/findings/[findingId]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id, findingId } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    const finding = await prisma.vraReportFinding.findFirst({
      where: { id: findingId, reportId: id },
    });
    if (!finding) {
      return NextResponse.json({ success: false, error: "Hallazgo no encontrado" }, { status: 404 });
    }

    const parsed = await parseBody(request, updateSchema);
    if (parsed.error) return parsed.error;
    const data = parsed.data;

    const updated = await prisma.vraReportFinding.update({
      where: { id: findingId },
      data: {
        description: data.description ?? undefined,
        severity: data.severity ?? undefined,
        location: data.location === undefined ? undefined : data.location,
        sectorTag: data.sectorTag === undefined ? undefined : data.sectorTag,
        category: data.category === undefined ? undefined : data.category,
        aggravatingFactors:
          data.aggravatingFactors === undefined ? undefined : data.aggravatingFactors,
        sortOrder: data.sortOrder ?? undefined,
      },
    });

    return NextResponse.json({ success: true, finding: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/vra/reports/[id]/findings/[findingId]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id, findingId } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    await prisma.vraReportFinding.delete({ where: { id: findingId } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
