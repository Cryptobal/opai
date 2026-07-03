/**
 * Servicio único de creación de tickets OPS (Fase 5). Lo usan tanto la ruta web
 * (`POST /api/ops/tickets`) como Slack, para no duplicar la lógica: resuelve el
 * tipo (o el default), genera el `code`, crea el ticket + filas de aprobación +
 * evento de auditoría en una transacción, y dispara notificaciones best-effort.
 *
 * Recibe inputs ya resueltos (tenant, actor, reportedBy, source): quien llama
 * hace su propia autorización/validación antes. NO es HTTP-aware.
 */

import { prisma } from "@/lib/prisma";
import { generateTicketCode } from "@/lib/tickets";
import { notifyTicketCreated } from "@/lib/tickets-notify";

export interface CreateOpsTicketInput {
  tenantId: string;
  actorId: string; // quien crea (para el evento de auditoría)
  reportedBy: string; // reportedBy del ticket (admin/contact/guardia id)
  title: string;
  description?: string | null;
  ticketTypeId?: string | null; // si falta → primer tipo activo por sortOrder
  priority?: string | null;
  source?: string; // default "manual"
  assignedTeam?: string | null;
  assignedTo?: string | null;
  installationId?: string | null;
  guardiaId?: string | null;
  sourceGuardEventId?: string | null;
  tags?: string[];
}

export type CreateOpsTicketResult =
  | { id: string; code: string; title: string; priority: string; status: string; assignedTeam: string; source: string; requiresApproval: boolean }
  | { error: string };

export async function createOpsTicket(input: CreateOpsTicketInput): Promise<CreateOpsTicketResult> {
  let typeId = input.ticketTypeId ?? undefined;
  if (!typeId) {
    const def = await prisma.opsTicketType.findFirst({
      where: { tenantId: input.tenantId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    typeId = def?.id;
  }
  if (!typeId) return { error: "No hay tipos de ticket configurados. Configure uno en Ops > Tipos de ticket." };

  const ticketType = await prisma.opsTicketType.findFirst({
    where: { id: typeId, tenantId: input.tenantId },
    include: { approvalSteps: { orderBy: { stepOrder: "asc" } } },
  });
  if (!ticketType) return { error: "Tipo de ticket no encontrado" };

  // Responsable por defecto del tipo (fix raíz de los tickets huérfanos): si el
  // input no trae responsable, hereda `defaultAssignedToUserId` del tipo. Aplica
  // a TODOS los orígenes (web, portal, email, Slack, IA) porque todos pasan por
  // acá. Se valida que el admin siga activo en el tenant; si no, null + warn.
  let resolvedAssignedTo = input.assignedTo ?? null;
  if (resolvedAssignedTo == null && ticketType.defaultAssignedToUserId) {
    const def = await prisma.admin.findFirst({
      where: { id: ticketType.defaultAssignedToUserId, tenantId: input.tenantId, status: "active" },
      select: { id: true },
    });
    if (def) {
      resolvedAssignedTo = def.id;
    } else {
      console.warn(
        `[tickets-create] Responsable por defecto ${ticketType.defaultAssignedToUserId} del tipo ${ticketType.id} no está activo en el tenant ${input.tenantId}; el ticket nace sin responsable.`,
      );
    }
  }

  const slaDueAt = new Date(Date.now() + ticketType.slaHours * 60 * 60 * 1000);
  const requiresApproval = ticketType.requiresApproval && ticketType.approvalSteps.length > 0;
  const initialStatus = requiresApproval ? "pending_approval" : "open";
  const approvalCreateData = requiresApproval
    ? ticketType.approvalSteps.map((s) => ({
        stepOrder: s.stepOrder, stepLabel: s.label, approverType: s.approverType,
        approverGroupId: s.approverGroupId, approverUserId: s.approverUserId, decision: "pending",
      }))
    : [];

  const ticket = await prisma.$transaction(async (tx) => {
    const last = await tx.opsTicket.findFirst({
      where: { tenantId: input.tenantId },
      orderBy: { createdAt: "desc" },
      select: { code: true },
    });
    const lastSeq = last?.code ? parseInt(last.code.split("-").pop() ?? "0", 10) : 0;
    const created = await tx.opsTicket.create({
      data: {
        tenantId: input.tenantId,
        code: generateTicketCode(lastSeq + 1),
        ticketTypeId: typeId,
        status: initialStatus,
        priority: input.priority ?? ticketType.defaultPriority,
        title: input.title,
        description: input.description ?? null,
        assignedTeam: input.assignedTeam ?? ticketType.assignedTeam,
        assignedTo: resolvedAssignedTo,
        installationId: input.installationId ?? null,
        source: input.source ?? "manual",
        sourceGuardEventId: input.sourceGuardEventId ?? null,
        guardiaId: input.guardiaId ?? null,
        reportedBy: input.reportedBy,
        slaDueAt,
        slaBreached: false,
        tags: input.tags ?? [],
        currentApprovalStep: requiresApproval ? 1 : null,
        approvalStatus: requiresApproval ? "pending" : null,
        approvals: { create: approvalCreateData },
      },
    });
    const { recordTicketEvent } = await import("@/lib/tickets-events");
    await recordTicketEvent({
      tenantId: input.tenantId, ticketId: created.id, type: "ticket_created", actorId: input.actorId,
      data: { source: created.source, priority: created.priority, assignedTeam: created.assignedTeam, assignedTo: created.assignedTo, requiresApproval },
      tx,
    });
    return created;
  });

  await notifyTicketCreated({
    tenantId: input.tenantId, actorId: input.actorId, requiresApproval,
    ticket: {
      id: ticket.id, code: ticket.code, title: ticket.title, description: ticket.description,
      priority: ticket.priority, assignedTeam: ticket.assignedTeam, assignedTo: ticket.assignedTo, source: ticket.source,
    },
    ticketType: { name: ticketType.name, approvalSteps: ticketType.approvalSteps },
  });

  return {
    id: ticket.id, code: ticket.code, title: ticket.title, priority: ticket.priority,
    status: ticket.status, assignedTeam: ticket.assignedTeam, source: ticket.source, requiresApproval,
  };
}
