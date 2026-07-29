/**
 * Modo casilla/cuenta única vs multicuenta (correo y agenda).
 *
 * Flags por tenant (`multicuentaCorreo` / `multicuentaAgenda`) en
 * `TenantModule.config`. Apagados por defecto.
 *
 * Regla de escape: si el usuario ya tiene 2+ cuentas, `enabled` queda true
 * aunque el flag esté apagado — para no ocultar correo/calendario ya sync.
 * `canConnect` sigue gobernado solo por el tope efectivo (1 sin flag, 5 con).
 */
import { prisma } from "@/lib/prisma";
import { isTenantFeatureFlagEnabled } from "@/lib/tenant-modules";
import { mailboxCapFor } from "@/modules/crm/email/mailbox-identity";

export const FLAG_MULTICUENTA_CORREO = "multicuentaCorreo";
export const FLAG_MULTICUENTA_AGENDA = "multicuentaAgenda";

/** Techo cuando el flag del tenant está encendido (mismo tope histórico). */
export const MAX_ACCOUNTS_WHEN_MULTI = 5;
export const MAX_ACCOUNTS_WHEN_SINGLE = 1;

export type MultiAccountScope = "correo" | "agenda";

export type MultiAccountState = {
  /** Flag del tenant O ya tiene 2+ cuentas (escape). */
  enabled: boolean;
  /** Solo el flag del tenant, sin la regla de escape. */
  flagEnabled: boolean;
  /** Puede conectar una cuenta más (tope efectivo). */
  canConnect: boolean;
  /** 1 sin flag, 5 con flag. */
  maxAccounts: number;
  connectedCount: number;
};

async function countConnected(params: {
  tenantId: string;
  userId: string;
  scope: MultiAccountScope;
}): Promise<number> {
  if (params.scope === "correo") {
    return prisma.crmEmailAccount.count({
      where: {
        tenantId: params.tenantId,
        userId: params.userId,
        provider: "gmail",
        status: "active",
      },
    });
  }
  return prisma.googleCalendarAccount.count({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      status: "ACTIVE",
    },
  });
}

function maxFor(scope: MultiAccountScope, flagEnabled: boolean): number {
  if (scope === "correo") return mailboxCapFor(flagEnabled);
  return flagEnabled ? MAX_ACCOUNTS_WHEN_MULTI : MAX_ACCOUNTS_WHEN_SINGLE;
}

export async function resolveMultiAccount(p: {
  tenantId: string;
  userId: string;
  scope: MultiAccountScope;
}): Promise<MultiAccountState> {
  const flag =
    p.scope === "correo" ? FLAG_MULTICUENTA_CORREO : FLAG_MULTICUENTA_AGENDA;
  const [flagEnabled, connectedCount] = await Promise.all([
    isTenantFeatureFlagEnabled(p.tenantId, flag),
    countConnected(p),
  ]);
  const maxAccounts = maxFor(p.scope, flagEnabled);
  const enabled = flagEnabled || connectedCount >= 2;
  const canConnect = connectedCount < maxAccounts;
  return { enabled, flagEnabled, canConnect, maxAccounts, connectedCount };
}
