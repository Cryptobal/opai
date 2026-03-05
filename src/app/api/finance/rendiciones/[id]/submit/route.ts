import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { notifyRendicionSubmitted } from "@/lib/finance-notifications";

type Params = { id: string };

// ── POST: submit rendicion for approval ──

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para enviar rendiciones" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const existing = await prisma.financeRendicion.findFirst({
      where: { id, tenantId: ctx.tenantId, submitterId: ctx.userId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Rendición no encontrada" },
        { status: 404 },
      );
    }

    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { success: false, error: `Solo se puede enviar desde DRAFT (actual: ${existing.status})` },
        { status: 400 },
      );
    }

    // Fetch tenant config to get configured approvers
    const config = await prisma.financeRendicionConfig.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    const approverIds: string[] = [];
    if (config?.defaultApprover1Id) approverIds.push(config.defaultApprover1Id);
    if (config?.defaultApprover2Id) approverIds.push(config.defaultApprover2Id);

    const rendicion = await prisma.$transaction(async (tx) => {
      // Determine target status based on approvers
      const hasApprovers = approverIds.length > 0;
      const targetStatus = hasApprovers ? "SUBMITTED" : "APPROVED";

      const updated = await tx.financeRendicion.update({
        where: { id },
        data: {
          status: targetStatus,
          submittedAt: new Date(),
        },
      });

      // Create approval records if approvers are configured
      if (hasApprovers) {
        await tx.financeApproval.createMany({
          data: approverIds.map((approverId, index) => ({
            rendicionId: id,
            approverId,
            approvalOrder: index + 1,
          })),
        });
      }

      await tx.financeRendicionHistory.create({
        data: {
          rendicionId: id,
          action: "SUBMITTED",
          fromStatus: "DRAFT",
          toStatus: targetStatus,
          userId: ctx.userId,
          userName: ctx.userEmail,
          comment: hasApprovers
            ? `Enviada a ${approverIds.length} aprobador(es)`
            : "Aprobada automáticamente (sin aprobadores configurados)",
        },
      });

      return updated;
    });

    // Send email notifications to approvers (fire-and-forget)
    if (approverIds.length > 0) {
      const approvers = await prisma.admin.findMany({
        where: { id: { in: approverIds }, status: "active" },
        select: { email: true },
      });
      const submitter = await prisma.admin.findUnique({
        where: { id: ctx.userId },
        select: { name: true },
      });
      notifyRendicionSubmitted({
        rendicionCode: existing.code,
        submitterName: submitter?.name ?? ctx.userEmail,
        amount: existing.amount,
        approverEmails: approvers.map((a) => a.email),
      }).catch((err) =>
        console.error("[Finance] Error sending submit notification:", err),
      );

      // Push: expense report submitted — notify approvers
      try {
        const { sendPushToSpecificAdmins } = await import('@/lib/pwa/push-service');
        const submitterName = submitter?.name ?? 'Un supervisor';
        await sendPushToSpecificAdmins(
          ctx.tenantId,
          approverIds,
          'expense_report_submitted',
          'Rendición de gastos enviada',
          `${submitterName} envió una rendición para revisión`,
          `/opai/finance/rendiciones/${id}`,
        );
      } catch (err) {
        console.error('[FINANCE] Error sending expense_report_submitted push:', err);
      }
    }

    return NextResponse.json({ success: true, data: rendicion });
  } catch (error) {
    console.error("[Finance] Error submitting rendicion:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo enviar la rendición" },
      { status: 500 },
    );
  }
}
