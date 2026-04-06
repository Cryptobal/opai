import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { requireTenantModule } from '@/lib/require-module';

const schema = z.object({
  canal: z.string().min(1),
  externalUrl: z.string().url().or(z.literal("")),
});

/**
 * PATCH /api/ops/ats/jobs/[jobId]/channel-url
 * Save the external URL for a manually-published channel on this job.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const modCheck = await requireTenantModule('ats');
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  await ensureOpsAccess(ctx);

  const { jobId } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const { canal, externalUrl } = parsed.data;

  // Verify job belongs to tenant
  const job = await prisma.atsJobPosting.findFirst({
    where: { id: jobId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!job) {
    return NextResponse.json(
      { success: false, error: "Aviso no encontrado" },
      { status: 404 },
    );
  }

  // Upsert channel record with the external URL
  await prisma.atsDistributionChannel.upsert({
    where: { jobPostingId_canal: { jobPostingId: jobId, canal } },
    create: {
      jobPostingId: jobId,
      canal,
      activo: true,
      estado: externalUrl ? "publicado" : "pendiente",
      externalId: externalUrl || null,
      publicadoAt: externalUrl ? new Date() : undefined,
    },
    update: {
      externalId: externalUrl || null,
      estado: externalUrl ? "publicado" : "pendiente",
      publicadoAt: externalUrl ? new Date() : undefined,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true });
}
