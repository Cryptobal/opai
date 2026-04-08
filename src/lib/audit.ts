import { prisma } from '@/lib/prisma';

type AuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'READ'
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED'
  | 'EXPORT_DATA' | 'CONSENT_GRANTED' | 'CONSENT_REVOKED'
  | 'DATA_ACCESS' | 'PERMISSION_CHANGE'
  | 'BREACH_DETECTED' | 'DATA_DELETION_REQUEST';

interface AuditLogParams {
  userId?: string | null;
  userEmail?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  tenantId?: string | null;
  request?: Request;
}

/**
 * Registra una acción en el audit log.
 * Diseñado para cumplimiento Ley 21.719 - registro de actividades de tratamiento.
 * No lanza errores para no interrumpir el flujo principal.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    let ipAddress: string | undefined;
    let userAgent: string | undefined;

    if (params.request) {
      const forwarded = params.request.headers.get('x-forwarded-for');
      ipAddress = forwarded?.split(',')[0].trim()
        || params.request.headers.get('x-real-ip')
        || undefined;
      userAgent = params.request.headers.get('user-agent') || undefined;
    }

    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? undefined,
        userEmail: params.userEmail ?? undefined,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? undefined,
        details: (params.details as never) ?? undefined,
        tenantId: params.tenantId ?? undefined,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error('[AuditLog] Failed to write audit entry:', error);
  }
}
