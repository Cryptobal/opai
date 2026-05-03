import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type TicketEventType =
  | "ticket_created"
  | "status_changed"
  | "assignee_changed"
  | "priority_changed"
  | "team_changed"
  | "sla_extended"
  | "sla_paused"
  | "sla_resumed"
  | "sla_snoozed"
  | "sla_unsnoozed"
  | "approval_decision"
  | "comment_deleted"
  | "comment_edited"
  | "link_added"
  | "link_removed"
  | "csat_submitted";

export interface RecordTicketEventInput {
  tenantId: string;
  ticketId: string;
  type: TicketEventType;
  actorId?: string | null;
  data?: Record<string, unknown> | null;
  /** Permite encadenar dentro de una transacción Prisma. */
  tx?: Prisma.TransactionClient;
}

/**
 * Registra un evento del ticket en el audit trail. Falla silenciosamente
 * (log + return null) para no romper el flujo de la mutación principal.
 *
 * Si pasas `tx`, el evento se escribe dentro de la transacción.
 */
export async function recordTicketEvent(
  input: RecordTicketEventInput,
): Promise<{ id: string } | null> {
  try {
    const client = (input.tx ?? (prisma as unknown as PrismaClient)) as Prisma.TransactionClient;
    const ev = await client.opsTicketEvent.create({
      data: {
        tenantId: input.tenantId,
        ticketId: input.ticketId,
        type: input.type,
        actorId: input.actorId ?? null,
        data: (input.data ?? {}) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return ev;
  } catch (err) {
    // Audit no debe romper la operación. Loguear y seguir.
    console.error("[tickets] recordTicketEvent failed:", err);
    return null;
  }
}
