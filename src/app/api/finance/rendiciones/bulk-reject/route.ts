import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { notifyRendicionRejected } from "@/lib/finance-notifications";
import { z } from "zod";

const bulkRejectSchema = z.object({
  rendicionIds: z.array(z.string().uuid()).min(1, "Al menos una rendición es requerida"),
  reason: z.string().min(1, "Motivo de rechazo es obligatorio").max(500),
});

export async function POST(request: NextRequest) {
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

    const parsed = await parseBody(request, bulkRejectSchema);
    if (parsed.error) return parsed.error;
    const { rendicionIds, reason } = parsed.data;

    // Fetch all rendiciones that are in rejectable state
    const rendiciones = await prisma.financeRendicion.findMany({
      where: {
        id: { in: rendicionIds },
        tenantId: ctx.tenantId,
        status: { in: ["SUBMITTED", "IN_APPROVAL"] },
      },
    });

    if (rendiciones.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron rendiciones rechazables" },
        { status: 400 },
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const rendicion of rendiciones) {
        // Update approval record if exists
        const myApproval = await tx.financeApproval.findFirst({
          where: { rendicionId: rendicion.id, approverId: ctx.userId },
        });

        if (myApproval) {
          await tx.financeApproval.update({
            where: { id: myApproval.id },
            data: {
              decision: "REJECTED",
              comment: reason,
              decidedAt: now,
            },
          });
        }

        await tx.financeRendicion.update({
          where: { id: rendicion.id },
          data: {
            status: "REJECTED",
            rejectedAt: now,
            rejectionReason: reason,
            rejectedById: ctx.userId,
          },
        });

        await tx.financeRendicionHistory.create({
          data: {
            rendicionId: rendicion.id,
            action: "REJECTED",
            fromStatus: rendicion.status,
            toStatus: "REJECTED",
            userId: ctx.userId,
            userName: ctx.userEmail,
            comment: reason,
            metadata: { bulkAction: true },
          },
        });
      }
    });

    // Send email notifications (fire-and-forget)
    const submitterIds = [...new Set(rendiciones.map((r) => r.submitterId))];
    const submitters = await prisma.admin.findMany({
      where: { id: { in: submitterIds } },
      select: { id: true, email: true },
    });
    const submitterMap = new Map(submitters.map((s) => [s.id, s.email]));
    const rejector = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });

    for (const rendicion of rendiciones) {
      const submitterEmail = submitterMap.get(rendicion.submitterId);
      if (submitterEmail) {
        notifyRendicionRejected({
          rendicionCode: rendicion.code,
          amount: rendicion.amount,
          submitterEmail,
          rejectorName: rejector?.name ?? ctx.userEmail,
          reason,
        }).catch((err) =>
          console.error("[Finance] Error sending reject notification:", err),
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: { rejected: rendiciones.length },
    });
  } catch (error) {
    console.error("[Finance] Error bulk rejecting rendiciones:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron rechazar las rendiciones" },
      { status: 500 },
    );
  }
}
