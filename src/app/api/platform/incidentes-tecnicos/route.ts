import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  tenantId: z.string().nullable().optional(),
  startedAt: z.string().min(1),
  endedAt: z.string().nullable().optional(),
  description: z.string().min(1),
  severity: z.enum(["total", "parcial"]),
});

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const rows = await prisma.dtIncidenteTecnico.findMany({
    orderBy: { startedAt: "desc" },
    include: { tenant: { select: { id: true, name: true, legalName: true } } },
    take: 500,
  });
  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      tenantName: r.tenant ? r.tenant.legalName || r.tenant.name : null,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      description: r.description,
      severity: r.severity,
      createdBy: r.createdBy,
    })),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const created = await prisma.dtIncidenteTecnico.create({
    data: {
      tenantId: parsed.data.tenantId || null,
      startedAt: new Date(parsed.data.startedAt),
      endedAt: parsed.data.endedAt ? new Date(parsed.data.endedAt) : null,
      description: parsed.data.description.trim(),
      severity: parsed.data.severity,
      createdBy: ctx.email,
    },
  });
  return NextResponse.json({ success: true, data: created });
}
