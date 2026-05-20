import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { notifyRendicionRejected } from "@/lib/finance-notifications";
import { z } from "zod";

type Params = { id: string };

const rejectSchema = z.object({
  reason: z.string().min(1, "Motivo de rechazo es obligatorio").max(500),
});

// ── POST: reject rendicion ──

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
        { success: false, error: "Sin permisos para rechazar rendiciones" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const parsed = await parseBody(request, rejectSchema);
    if (parsed.error) return parsed.error;
    const { reason } = parsed.data;

    const rendicion = await prisma.financeRendicion.findFirst({
      where: { id, tenantId: ctx.tenantId },
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
          error: `Solo se puede rechazar en estado SUBMITTED (actual: ${rendicion.status})`,
        },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update the approval record if exists
      const myApproval = await tx.financeApproval.findFirst({
        where: { rendicionId: id, approverId: ctx.userId },
      });

      if (myApproval) {
        await tx.financeApproval.update({
          where: { id: myApproval.id },
          data: {
            decision: "REJECTED",
            comment: reason,
            decidedAt: new Date(),
          },
        });
      }

      const updated = await tx.financeRendicion.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectionReason: reason,
          rejectedById: ctx.userId,
        },
      });

      await tx.financeRendicionHistory.create({
        data: {
          rendicionId: id,
          action: "REJECTED",
          fromStatus: rendicion.status,
          toStatus: "REJECTED",
          userId: ctx.userId,
          userName: ctx.userEmail,
          comment: reason,
        },
      });

      return updated;
    });

    // Send email to submitter (fire-and-forget)
    const submitter = await prisma.admin.findUnique({
      where: { id: rendicion.submitterId },
      select: { email: true },
    });
    const rejector = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });
    if (submitter?.email) {
      notifyRendicionRejected({
        tenantId: ctx.tenantId,
        rendicionCode: rendicion.code,
        amount: rendicion.amount,
        submitterEmail: submitter.email,
        rejectorName: rejector?.name ?? ctx.userEmail,
        reason,
      }).catch((err) =>
        console.error("[Finance] Error sending reject notification:", err),
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance] Error rejecting rendicion:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo rechazar la rendición" },
      { status: 500 },
    );
  }
}
