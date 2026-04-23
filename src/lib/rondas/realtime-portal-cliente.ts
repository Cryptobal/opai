/**
 * Portal cliente realtime bus.
 *
 * El canal `monitoreo-${tenantId}` ya se usa para los tableros internos de
 * operaciones (monitoreo, rondas, etc.) pero NO puede ser expuesto a clientes
 * finales porque filtra tráfico cross-account dentro del mismo tenant.
 *
 * Este módulo provee un canal paralelo, privado y segmentado por cuenta:
 *
 *   private-portal-cliente-account-${accountId}
 *
 * La autorización vive en `/api/portal/cliente/chat/pusher/auth` y sólo deja
 * suscribirse al cliente cuyo `session.accountId` coincide con el del canal.
 *
 * Reglas:
 *   - No emitir datos sensibles (PII de guardias al desnudo, teléfonos, etc.).
 *     Los eventos llevan apenas el id + flags suficientes para que el frontend
 *     dispare un refetch de los endpoints `/api/portal/cliente/...`.
 *   - La resolución `installationId → accountId` se hace en server-side y se
 *     cachea durante el lifetime del proceso (los installations no cambian de
 *     cuenta).
 *   - Si algo falla (pusher caído, accountId no resuelto), se loggea y se sigue:
 *     el realtime es best-effort, el portal refetch periódicamente de todos modos.
 */

import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";

export type PortalClienteRealtimeEvent =
  | "ronda-started"
  | "ronda-progress"
  | "ronda-completed"
  | "alerta";

export function portalClienteAccountChannel(accountId: string): string {
  return `private-portal-cliente-account-${accountId}`;
}

// Cache simple installationId → accountId. Como las instalaciones nunca cambian
// de cuenta, mantener esto en memoria durante el lifetime del worker es seguro.
const installationToAccountCache = new Map<string, string | null>();

async function resolveAccountIdForInstallation(
  installationId: string,
): Promise<string | null> {
  if (installationToAccountCache.has(installationId)) {
    return installationToAccountCache.get(installationId) ?? null;
  }
  const inst = await prisma.crmInstallation.findUnique({
    where: { id: installationId },
    select: { accountId: true },
  });
  const accountId = inst?.accountId ?? null;
  installationToAccountCache.set(installationId, accountId);
  return accountId;
}

async function resolveAccountIdForEjecucion(
  ejecucionId: string,
): Promise<string | null> {
  const row = await prisma.opsRondaEjecucion.findUnique({
    where: { id: ejecucionId },
    select: {
      installationId: true,
      rondaTemplate: { select: { installationId: true } },
    },
  });
  const installationId =
    row?.installationId ?? row?.rondaTemplate?.installationId ?? null;
  if (!installationId) return null;
  return resolveAccountIdForInstallation(installationId);
}

/**
 * Emite un evento al portal cliente dueño de la instalación/ejecución.
 * Best-effort: cualquier error se loggea y se descarta.
 */
export async function broadcastToPortalCliente(params: {
  event: PortalClienteRealtimeEvent;
  ejecucionId?: string;
  installationId?: string | null;
  accountId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    let accountId = params.accountId ?? null;
    if (!accountId && params.installationId) {
      accountId = await resolveAccountIdForInstallation(params.installationId);
    }
    if (!accountId && params.ejecucionId) {
      accountId = await resolveAccountIdForEjecucion(params.ejecucionId);
    }
    if (!accountId) return;

    const pusher = getPusherServer();
    await pusher.trigger(portalClienteAccountChannel(accountId), params.event, {
      ejecucionId: params.ejecucionId ?? null,
      installationId: params.installationId ?? null,
      ...(params.payload ?? {}),
    });
  } catch (err) {
    console.error("[portal-cliente-realtime] broadcast failed:", err);
  }
}
