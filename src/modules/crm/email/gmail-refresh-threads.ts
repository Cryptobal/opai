import type { gmail_v1 } from "googleapis";
import { refreshThreadLabelsFromGmail } from "./gmail-thread-actions";

/**
 * Refresca el estado local (INBOX/SPAM/TRASH/UNREAD) de un lote de hilos
 * leyendo cada hilo real en Gmail. Respeta `deadline`; los hilos que no
 * alcanzan a refrescarse quedan para la próxima corrida (idempotente).
 */
export async function refreshThreadLabelsBatch(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccountId: string;
  threadIds: Iterable<string>;
  deadline: number;
}): Promise<number> {
  let refreshed = 0;
  for (const providerThreadId of params.threadIds) {
    if (Date.now() >= params.deadline) break;
    await refreshThreadLabelsFromGmail({
      gmail: params.gmail,
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
      providerThreadId,
    });
    refreshed += 1;
  }
  return refreshed;
}
