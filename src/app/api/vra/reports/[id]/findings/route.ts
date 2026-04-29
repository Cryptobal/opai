import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const SEVERITY_VALUES = ["critical", "high", "medium", "low"] as const;

const createSchema = z.object({
  description: z.string().min(3).max(2000),
  severity: z.enum(SEVERITY_VALUES).default("medium"),
  location: z.string().max(200).optional().nullable(),
  sectorTag: z.string().max(80).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  aggravatingFactors: z.string().max(2000).optional().nullable(),
});

/**
 * GET /api/vra/reports/[id]/findings
 * Lista los hallazgos cargados al informe (vra.report_findings).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    const findings = await prisma.vraReportFinding.findMany({
      where: { reportId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ success: true, findings });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/vra/reports/[id]/findings
 * Agrega un hallazgo al informe.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    const parsed = await parseBody(request, createSchema);
    if (parsed.error) return parsed.error;
    const data = parsed.data;

    const lastOrder = await prisma.vraReportFinding.findFirst({
      where: { reportId: id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (lastOrder?.sortOrder ?? -10) + 10;

    const created = await prisma.vraReportFinding.create({
      data: {
        reportId: id,
        description: data.description,
        severity: data.severity,
        location: data.location ?? null,
        sectorTag: data.sectorTag ?? null,
        category: data.category ?? null,
        aggravatingFactors: data.aggravatingFactors ?? null,
        sortOrder,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, finding: created });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
