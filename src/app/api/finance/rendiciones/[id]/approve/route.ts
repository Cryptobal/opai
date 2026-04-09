import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { notifyRendicionApproved } from "@/lib/finance-notifications";
import { z } from "zod";

type Params = { id: string };

const approveSchema = z.object({
  comment: z.string().max(500).optional(),
});

// ── POST: approve rendicion ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!hasCapability(perms, "rendicion_approve")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para aprobar rendiciones" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const parsed = await parseBody(request, approveSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const rendicion = await prisma.financeRendicion.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { approvals: true },
    });

    if (!rendicion) {
      return NextResponse.json(
        { success: false, error: "Rendición no encontrada" },
        { status: 404 },
      );
    }

    if (rendicion.status !== "SUBMITTED") {
      return NextResponse.json(
        {
          success: false,
          error: `Solo se puede aprobar en estado SUBMITTED (actual: ${rendicion.status})`,
        },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Mark all approval records as approved
      await tx.financeApproval.updateMany({
        where: { rendicionId: id, decision: null },
        data: {
          decision: "APPROVED",
          comment: body.comment ?? null,
          decidedAt: new Date(),
        },
      });

      // Move directly to APPROVED
      const updated = await tx.financeRendicion.update({
        where: { id },
        data: { status: "APPROVED" },
      });

      await tx.financeRendicionHistory.create({
        data: {
          rendicionId: id,
          action: "APPROVED",
          fromStatus: rendicion.status,
          toStatus: "APPROVED",
          userId: ctx.userId,
          userName: ctx.userEmail,
          comment: body.comment ?? null,
          metadata: { fullyApproved: true },
        },
      });

      return { updated, allApproved: true };
    });

    // Send email to submitter when fully approved (fire-and-forget)
    if (result.allApproved) {
      const submitter = await prisma.admin.findUnique({
        where: { id: rendicion.submitterId },
        select: { email: true },
      });
      const approver = await prisma.admin.findUnique({
        where: { id: ctx.userId },
        select: { name: true },
      });
      if (submitter?.email) {
        notifyRendicionApproved({
          rendicionCode: rendicion.code,
          amount: rendicion.amount,
          submitterEmail: submitter.email,
          approverName: approver?.name ?? ctx.userEmail,
        }).catch((err) =>
          console.error("[Finance] Error sending approve notification:", err),
        );
      }
    }

    return NextResponse.json({ success: true, data: result.updated });
  } catch (error) {
    console.error("[Finance] Error approving rendicion:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo aprobar la rendición" },
      { status: 500 },
    );
  }
}
