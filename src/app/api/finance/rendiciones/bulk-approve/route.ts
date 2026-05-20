import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { notifyRendicionApproved } from "@/lib/finance-notifications";
import { z } from "zod";

const bulkApproveSchema = z.object({
  rendicionIds: z.array(z.string().uuid()).min(1, "Al menos una rendición es requerida"),
  comment: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
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

    const parsed = await parseBody(request, bulkApproveSchema);
    if (parsed.error) return parsed.error;
    const { rendicionIds, comment } = parsed.data;

    // Fetch all rendiciones that are in approvable state
    const rendiciones = await prisma.financeRendicion.findMany({
      where: {
        id: { in: rendicionIds },
        tenantId: ctx.tenantId,
        status: { in: ["SUBMITTED"] },
      },
      include: { approvals: true },
    });

    if (rendiciones.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron rendiciones aprobables" },
        { status: 400 },
      );
    }

    const results = await prisma.$transaction(async (tx) => {
      const approved: string[] = [];

      for (const rendicion of rendiciones) {
        // Mark all approval records as approved
        await tx.financeApproval.updateMany({
          where: { rendicionId: rendicion.id, decision: null },
          data: {
            decision: "APPROVED",
            comment: comment ?? null,
            decidedAt: new Date(),
          },
        });

        // Move directly to APPROVED
        await tx.financeRendicion.update({
          where: { id: rendicion.id },
          data: { status: "APPROVED" },
        });

        await tx.financeRendicionHistory.create({
          data: {
            rendicionId: rendicion.id,
            action: "APPROVED",
            fromStatus: rendicion.status,
            toStatus: "APPROVED",
            userId: ctx.userId,
            userName: ctx.userEmail,
            comment: comment ?? null,
            metadata: { fullyApproved: true, bulkAction: true },
          },
        });

        approved.push(rendicion.id);
      }

      return { approved, total: rendiciones.length };
    });

    // Send email notifications for fully approved rendiciones (fire-and-forget)
    if (results.approved.length > 0) {
      const fullyApproved = rendiciones.filter((r) =>
        results.approved.includes(r.id),
      );
      const submitterIds = [...new Set(fullyApproved.map((r) => r.submitterId))];
      const submitters = await prisma.admin.findMany({
        where: { id: { in: submitterIds } },
        select: { id: true, email: true },
      });
      const submitterMap = new Map(submitters.map((s) => [s.id, s.email]));
      const approver = await prisma.admin.findUnique({
        where: { id: ctx.userId },
        select: { name: true },
      });

      for (const rendicion of fullyApproved) {
        const submitterEmail = submitterMap.get(rendicion.submitterId);
        if (submitterEmail) {
          notifyRendicionApproved({
            tenantId: ctx.tenantId,
            rendicionCode: rendicion.code,
            amount: rendicion.amount,
            submitterEmail,
            approverName: approver?.name ?? ctx.userEmail,
          }).catch((err) =>
            console.error("[Finance] Error sending approve notification:", err),
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: results.total,
        fullyApproved: results.approved.length,
      },
    });
  } catch (error) {
    console.error("[Finance] Error bulk approving rendiciones:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron aprobar las rendiciones" },
      { status: 500 },
    );
  }
}
