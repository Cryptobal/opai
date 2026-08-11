/**
 * Interruptor de lectura: solo true cuando la migración del tenant
 * terminó con paridad OK (status === "completed").
 * Cache por request (AsyncLocalStorage-lite vía Map en módulo + reset).
 */

import { prisma } from "@/lib/prisma";

const cache = new Map<string, boolean>();

export function clearReadsUnifiedCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

export async function readsUnified(tenantId: string): Promise<boolean> {
  if (cache.has(tenantId)) return cache.get(tenantId)!;
  const row = await prisma.docsMigrationState.findUnique({
    where: { tenantId },
    select: { status: true },
  });
  const ok = row?.status === "completed";
  cache.set(tenantId, ok);
  return ok;
}
