/**
 * Audit log de correo (C07): toda mutación del módulo escribe una fila en el
 * modelo AuditLog existente, con tenantId OBLIGATORIO. En `meta` van solo IDs
 * y metadatos mínimos — nunca cuerpos de correo ni tokens.
 */
import { prisma } from "@/lib/prisma";

export type EmailAuditAction =
  | "send"
  | "archive"
  | "unarchive"
  | "trash"
  | "markRead"
  | "markUnread"
  | "snooze"
  | "unsnooze"
  | "associate"
  | "create_lead"
  | "connect_account"
  | "disconnect_account";

export type EmailAuditEntityType =
  | "email_thread"
  | "email_message"
  | "email_account"
  | "crm_lead";

/** No lanza: un fallo de auditoría no interrumpe la mutación principal. */
export async function auditEmailAction(params: {
  tenantId: string;
  userId?: string | null;
  userEmail?: string | null;
  action: EmailAuditAction;
  entityType: EmailAuditEntityType;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? undefined,
        userEmail: params.userEmail ?? undefined,
        action: `email.${params.action}`,
        entity: params.entityType,
        entityId: params.entityId ?? undefined,
        details: (params.meta as never) ?? undefined,
      },
    });
  } catch (error) {
    console.error("[audit-email] no se pudo registrar la acción", {
      action: params.action,
      entityType: params.entityType,
      error,
    });
  }
}
