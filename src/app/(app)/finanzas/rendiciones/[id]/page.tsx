import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { RendicionDetail } from "@/components/finance/RendicionDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RendicionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/finanzas/rendiciones/${id}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const rendicion = await prisma.financeRendicion.findFirst({
    where: { id, tenantId },
    include: {
      item: { select: { id: true, name: true, code: true } },
      costCenter: { select: { id: true, name: true, code: true } },
      trip: true,
      approvals: {
        orderBy: { approvalOrder: "asc" },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
      },
      history: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!rendicion) {
    notFound();
  }

  // Resolve user names for history and approvals
  const userIds = [
    rendicion.submitterId,
    ...(rendicion.rejectedById ? [rendicion.rejectedById] : []),
    ...rendicion.approvals.map((a) => a.approverId),
    ...rendicion.history.map((h) => h.userId),
  ];
  const uniqueUserIds = [...new Set(userIds)];
  const users = await prisma.admin.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

  // Permissions
  const canApprove = hasCapability(perms, "rendicion_approve");
  const canPay = hasCapability(perms, "rendicion_pay");
  const canSubmit = hasCapability(perms, "rendicion_submit");
  const isOwner = rendicion.submitterId === session.user.id;
  const isApprover = rendicion.approvals.some(
    (a) => a.approverId === session.user.id && !a.decision
  );

  const data = {
    id: rendicion.id,
    code: rendicion.code,
    type: rendicion.type,
    status: rendicion.status,
    amount: rendicion.amount,
    date: rendicion.date.toISOString(),
    description: rendicion.description,
    documentType: rendicion.documentType,
    submitterId: rendicion.submitterId,
    submitterName: userMap[rendicion.submitterId] ?? "Desconocido",
    submittedAt: rendicion.submittedAt?.toISOString() ?? null,
    paidAt: rendicion.paidAt?.toISOString() ?? null,
    paymentMethod: rendicion.paymentMethod,
    rejectedAt: rendicion.rejectedAt?.toISOString() ?? null,
    rejectionReason: rendicion.rejectionReason,
    rejectedByName: rendicion.rejectedById
      ? userMap[rendicion.rejectedById] ?? null
      : null,
    createdAt: rendicion.createdAt.toISOString(),
    item: rendicion.item
      ? { id: rendicion.item.id, name: rendicion.item.name, code: rendicion.item.code }
      : null,
    costCenter: rendicion.costCenter
      ? { id: rendicion.costCenter.id, name: rendicion.costCenter.name, code: rendicion.costCenter.code }
      : null,
    trip: rendicion.trip
      ? {
          id: rendicion.trip.id,
          startLat: Number(rendicion.trip.startLat),
          startLng: Number(rendicion.trip.startLng),
          startAddress: rendicion.trip.startAddress,
          startedAt: rendicion.trip.startedAt.toISOString(),
          endLat: rendicion.trip.endLat ? Number(rendicion.trip.endLat) : null,
          endLng: rendicion.trip.endLng ? Number(rendicion.trip.endLng) : null,
          endAddress: rendicion.trip.endAddress,
          endedAt: rendicion.trip.endedAt?.toISOString() ?? null,
          distanceKm: rendicion.trip.distanceKm
            ? Number(rendicion.trip.distanceKm)
            : null,
          fuelCost: rendicion.trip.fuelCost,
          vehicleFee: rendicion.trip.vehicleFee,
          tollAmount: rendicion.trip.tollAmount,
          totalAmount: rendicion.trip.totalAmount,
          status: rendicion.trip.status,
        }
      : null,
    approvals: rendicion.approvals.map((a) => ({
      id: a.id,
      approverId: a.approverId,
      approverName: userMap[a.approverId] ?? "Desconocido",
      approvalOrder: a.approvalOrder,
      decision: a.decision,
      comment: a.comment,
      decidedAt: a.decidedAt?.toISOString() ?? null,
    })),
    attachments: rendicion.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      publicUrl: a.publicUrl,
      attachmentType: a.attachmentType,
    })),
    history: rendicion.history.map((h) => ({
      id: h.id,
      action: h.action,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      userId: h.userId,
      userName: h.userName ?? userMap[h.userId] ?? "Desconocido",
      comment: h.comment,
      createdAt: h.createdAt.toISOString(),
    })),
  };

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title={`Rendición ${rendicion.code}`}
        description="Detalle de la rendición de gasto."
      />
      <RendicionDetail
        rendicion={data}
        permissions={{
          canApprove: canApprove && isApprover,
          canPay,
          canEdit: canSubmit && isOwner,
          isOwner,
        }}
      />
    </div>
  );
}
