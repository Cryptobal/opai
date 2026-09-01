import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type DtAccessAction =
  | "request_code"
  | "request_code_rejected"
  | "login"
  | "login_failed"
  | "select_employer"
  | "view_report"
  | "export_report"
  | "view_clientes"
  | "export_clientes"
  | "view_incidentes"
  | "export_incidentes"
  | "verify_hash"
  | "logout"
  | "session_expired";

export async function logDtAccess(params: {
  email: string;
  action: DtAccessAction;
  tenantId?: string | null;
  tenantRut?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.dtFiscalizacionAccessLog.create({
      data: {
        email: params.email,
        action: params.action,
        tenantId: params.tenantId ?? null,
        tenantRut: params.tenantRut ?? null,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        meta: params.meta ? (params.meta as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (error) {
    console.error("[FISCALIZACION-DT] No se pudo registrar bitácora:", error);
  }
}
