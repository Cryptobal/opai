import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  startedAt: z.string().optional(),
  endedAt: z.string().nullable().optional(),
  description: z.string().min(1).optional(),
  severity: z.enum(["total", "parcial"]).optional(),
  tenantId: z.string().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.startedAt) data.startedAt = new Date(parsed.data.startedAt);
  if ("endedAt" in parsed.data) data.endedAt = parsed.data.endedAt ? new Date(parsed.data.endedAt) : null;
  if (parsed.data.description) data.description = parsed.data.description.trim();
  if (parsed.data.severity) data.severity = parsed.data.severity;
  if ("tenantId" in parsed.data) data.tenantId = parsed.data.tenantId || null;

  const updated = await prisma.dtIncidenteTecnico.update({ where: { id }, data });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();
  const { id } = await params;
  await prisma.dtIncidenteTecnico.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
