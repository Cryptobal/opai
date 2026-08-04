"use client";

/**
 * Offline deliberado de la bandeja (C22b, PR-16):
 *  - Snapshot IndexedDB de los últimos ~50 hilos del inbox (metadata +
 *    snippet) y de los detalles abiertos (cuerpos ya sanitizados por
 *    EmailHtmlBody al render; sin adjuntos binarios).
 *  - Cola local de acciones (archivar, leer, papelera…) hechas offline, que
 *    se reconcilia al volver la conexión.
 *  - Cola de envíos offline: el body del composer YA trae su idempotencyKey,
 *    así el flush al reconectar no puede duplicar (el outbox dedupe por key).
 */

import type { CorreoThreadDTO, CorreoDetail } from "@/modules/crm/email/correos.types";

const DB_NAME = "opai-correos";
const DB_VERSION = 1;
const SNAPSHOT_LIMIT = 50;

type PendingAction = {
  id: string;
  threadId: string;
  action: string;
  snoozeUntil?: string;
  queuedAt: string;
};

type PendingSend = {
  /** idempotencyKey del body — identidad estable del envío. */
  id: string;
  body: Record<string, unknown>;
  queuedAt: string;
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("details")) db.createObjectStore("details");
      if (!db.objectStoreNames.contains("pendingActions")) {
        db.createObjectStore("pendingActions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("pendingSends")) {
        db.createObjectStore("pendingSends", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = run(db.transaction(store, mode).objectStore(store));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/* ── Snapshot del inbox ── */

export async function saveInboxSnapshot(items: CorreoThreadDTO[]): Promise<void> {
  await tx("kv", "readwrite", (s) =>
    s.put(
      { items: items.slice(0, SNAPSHOT_LIMIT), savedAt: new Date().toISOString() },
      "inbox",
    ),
  );
}

export async function loadInboxSnapshot(): Promise<{
  items: CorreoThreadDTO[];
  savedAt: string;
} | null> {
  const raw = await tx<{ items: CorreoThreadDTO[]; savedAt: string }>(
    "kv",
    "readonly",
    (s) => s.get("inbox") as IDBRequest<{ items: CorreoThreadDTO[]; savedAt: string }>,
  );
  return raw ?? null;
}

/* ── Detalles de hilo ── */

const prefetchInflight = new Map<string, Promise<void>>();
const PREFETCH_TTL_MS = 30_000;
const prefetchTimestamps = new Map<string, number>();

export function prefetchDetail(threadId: string): void {
  if (!threadId) return;
  const last = prefetchTimestamps.get(threadId);
  if (last != null && Date.now() - last < PREFETCH_TTL_MS) return;
  if (prefetchInflight.has(threadId)) return;

  const job = fetch(`/api/crm/correos/${threadId}`, { credentials: "include" })
    .then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as { success?: boolean; data?: CorreoDetail };
      if (data.success && data.data) {
        await saveOfflineDetail(data.data);
        prefetchTimestamps.set(threadId, Date.now());
      }
    })
    .catch(() => {})
    .finally(() => {
      prefetchInflight.delete(threadId);
    });

  prefetchInflight.set(threadId, job);
}

export async function saveOfflineDetail(detail: CorreoDetail): Promise<void> {
  await tx("details", "readwrite", (s) => s.put(detail, detail.thread.id));
}

export async function loadOfflineDetail(threadId: string): Promise<CorreoDetail | null> {
  return tx<CorreoDetail>("details", "readonly", (s) => s.get(threadId) as IDBRequest<CorreoDetail>);
}

/* ── Cola de acciones offline ── */

export async function queueOfflineAction(params: {
  threadId: string;
  action: string;
  snoozeUntil?: string;
}): Promise<void> {
  const item: PendingAction = {
    id: `${params.threadId}:${params.action}:${Date.now()}`,
    threadId: params.threadId,
    action: params.action,
    snoozeUntil: params.snoozeUntil,
    queuedAt: new Date().toISOString(),
  };
  await tx("pendingActions", "readwrite", (s) => s.put(item));
}

async function allOf<T>(store: string): Promise<T[]> {
  const result = await tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
  return result ?? [];
}

async function deleteFrom(store: string, key: string): Promise<void> {
  await tx(store, "readwrite", (s) => s.delete(key));
}

/** Reconcilia las acciones encoladas. Devuelve cuántas aplicó. */
export async function flushOfflineActions(): Promise<number> {
  const pending = await allOf<PendingAction>("pendingActions");
  let applied = 0;
  for (const item of pending.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))) {
    try {
      const res = await fetch(`/api/crm/correos/${item.threadId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          item.snoozeUntil
            ? { action: item.action, snoozeUntil: item.snoozeUntil }
            : { action: item.action },
        ),
      });
      // 4xx = definitivo (hilo borrado, acción inválida): descartar igual.
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        await deleteFrom("pendingActions", item.id);
        if (res.ok) applied += 1;
      } else {
        break; // 5xx/red: reintentar en el próximo flush
      }
    } catch {
      break; // sin red aún
    }
  }
  return applied;
}

/* ── Cola de envíos offline ── */

export async function queueOfflineSend(body: Record<string, unknown>): Promise<void> {
  const id = typeof body.idempotencyKey === "string" ? body.idempotencyKey : `${Date.now()}`;
  const item: PendingSend = { id, body, queuedAt: new Date().toISOString() };
  await tx("pendingSends", "readwrite", (s) => s.put(item));
}

/**
 * Postea los envíos pendientes; la idempotencyKey garantiza cero duplicados.
 * Cuenta enqueues (202) como éxito de flush — el despacho real lo confirma
 * el outbox; el caller debe etiquetar como "encolados", no "entregados".
 */
export async function flushOfflineSends(): Promise<number> {
  const pending = await allOf<PendingSend>("pendingSends");
  let sent = 0;
  for (const item of pending.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))) {
    try {
      const res = await fetch("/api/crm/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        await deleteFrom("pendingSends", item.id);
        if (res.ok) sent += 1;
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return sent;
}

export async function pendingOfflineCounts(): Promise<{ actions: number; sends: number }> {
  const [actions, sends] = await Promise.all([
    allOf<PendingAction>("pendingActions"),
    allOf<PendingSend>("pendingSends"),
  ]);
  return { actions: actions.length, sends: sends.length };
}
