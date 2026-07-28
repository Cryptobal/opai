"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type PointerEventHandler,
} from "react";
import { CorreoReaderShell } from "./CorreoReaderShell";
import { CorreoDrawerContent } from "./CorreoDrawerContent";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { CorreoSnoozeSheet } from "./CorreoSnoozeSheet";
import { snoozeThread } from "./correo-thread-action-client";
import { useMarkCorreoRead } from "./useMarkCorreoRead";
import { parseSender } from "./correo-sender";
import { loadOfflineDetail } from "./offline-store";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import type { CorreoShortcuts } from "./useCorreosViewPreferences";
import { nextIntentNonce, type ComposeIntent } from "./correo-reader-intent";

type ThreadPreview = {
  fromEmail?: string | null;
  subject?: string | null;
};

type Props = {
  threadId: string | null;
  /** Datos de la fila de la lista: header inmediato sin esperar el fetch. */
  preview?: ThreadPreview | null;
  /** Casilla Gmail conectada (se muestra al guardar adjuntos). */
  mailboxEmail?: string | null;
  onClose: () => void;
  onChanged?: () => void;
  /** Remoción optimista + avance al siguiente (desktop split). */
  onRemove?: (threadId: string) => void;
  /** Refresh suave tras archivar/eliminar (sin re-pintar filas). */
  onRemoveDone?: () => void;
  /** Rehidratar lista al Deshacer archivar/eliminar. */
  onUndoDone?: () => void;
  autoExtract?: boolean;
  canModify?: boolean;
  refreshToken?: number;
  desktopWidth?: number;
  onResizePointerDown?: PointerEventHandler<HTMLElement>;
  onResizeKeyDown?: KeyboardEventHandler<HTMLElement>;
  onResizeReset?: () => void;
  desktopMode?: "split" | "overlay";
  manageBackHistory?: boolean;
  alwaysShowImages?: boolean;
  onAlwaysShowImages?: () => void;
  shortcuts?: CorreoShortcuts;
  workTabIntent?: { tab: import("./work-panel-tabs").WorkTab; nonce: number } | null;
  composeIntent?: ComposeIntent | null;
  onOpenAiLead?: () => void;
  onAiCommand?: (commandId: import("@/modules/crm/email/correo-ai-commands").CorreoAiCommandId) => void;
  onOpenAiMenu?: () => void;
};

export function CorreoDrawer({
  threadId,
  preview = null,
  mailboxEmail = null,
  onClose,
  onChanged,
  onRemove,
  onRemoveDone,
  onUndoDone,
  autoExtract,
  canModify,
  refreshToken = 0,
  desktopWidth = 560,
  onResizePointerDown = () => {},
  onResizeKeyDown = () => {},
  onResizeReset = () => {},
  desktopMode = "overlay",
  manageBackHistory = true,
  alwaysShowImages,
  onAlwaysShowImages,
  shortcuts,
  workTabIntent = null,
  composeIntent = null,
  onOpenAiLead,
  onAiCommand,
  onOpenAiMenu,
}: Props) {
  const [detail, setDetail] = useState<CorreoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  /** Pedido local (barra móvil Responder) sin pasar por CorreosClient. */
  const [localComposeIntent, setLocalComposeIntent] = useState<ComposeIntent | null>(null);
  // Evita reutilizar el detalle del hilo anterior al cambiar de correo.
  const detailThreadId = detail?.thread.id ?? null;
  // Guarda el hilo pedido para descartar respuestas stale (p. ej. onDone de
  // archivar que llega después de avanzar al siguiente correo).
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!threadId) return;
    const requestedId = threadId;
    // `silent`: refresh en vivo (mailbox-changed / foco). No muestra spinner ni
    // vacía el detalle si la respuesta falla, para no parpadear el lector
    // mientras se está leyendo el correo.
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`/api/crm/correos/${requestedId}`);
      const data = r.ok ? ((await r.json()) as CorreoDetail) : null;
      if (threadIdRef.current !== requestedId) return;
      if (data || !silent) setDetail(data);
      // C22b: guardar el detalle para lectura offline (sin adjuntos binarios).
      if (data) {
        const { saveOfflineDetail } = await import("./offline-store");
        void saveOfflineDetail(data);
      }
    } catch {
      // Sin red: servir el detalle guardado si existe (solo en carga visible).
      if (!silent) {
        const { loadOfflineDetail } = await import("./offline-store");
        const cached = await loadOfflineDetail(requestedId);
        if (threadIdRef.current !== requestedId) return;
        setDetail(cached);
      }
    } finally {
      if (!silent && threadIdRef.current === requestedId) setLoading(false);
    }
  }, [threadId]);

  // Carga inicial / cambio de hilo: header desde `preview`; cuerpo desde
  // IndexedDB (si hay) + red. No vaciamos el detalle del hilo anterior con
  // un null intermedio si ya estamos pidiendo el mismo id; al cambiar de id
  // limpiamos para no mostrar el HTML del correo previo (evita “pestañeo”
  // de un pedazo de correo sobre otro).
  useEffect(() => {
    setLocalComposeIntent(null);
    setSnoozeOpen(false);
    if (!threadId) {
      setDetail(null);
      return;
    }
    setDetail((prev) => (prev?.thread.id === threadId ? prev : null));
    let cancelled = false;
    void loadOfflineDetail(threadId).then((cached) => {
      if (cancelled || !cached) return;
      setDetail((prev) => {
        if (prev?.thread.id === threadId) return prev;
        return cached;
      });
    });
    void load();
    return () => {
      cancelled = true;
    };
  }, [load, threadId]);
  // Refresh en vivo: recarga en segundo plano sin vaciar ni parpadear el
  // lector. Se omite la primera ejecución (el efecto de arriba ya cargó) para
  // no duplicar el fetch inicial. Usa un ref a `load` para no reejecutarse
  // cuando cambia el hilo (eso ya lo cubre el efecto de carga inicial).
  const loadRef = useRef(load);
  loadRef.current = load;
  const firstRefreshRef = useRef(true);
  useEffect(() => {
    if (firstRefreshRef.current) {
      firstRefreshRef.current = false;
      return;
    }
    void loadRef.current({ silent: true });
  }, [refreshToken]);

  useEffect(() => {
    if (autoExtract && detail && !detail.thread.leadId) onOpenAiLead?.();
  }, [autoExtract, detail, onOpenAiLead]);

  const refresh = useCallback(() => {
    void load();
    onChanged?.();
  }, [load, onChanged]);

  // Solo actualiza el detalle local: la lista ya marca leído al abrir (openThread)
  // y un onChanged aquí re-fetchaba la bandeja → pestañeo al cambiar de hilo.
  useMarkCorreoRead(threadId, detail?.thread.isUnread, canModify, () => {
    setDetail((d) => (d ? { ...d, thread: { ...d.thread, isUnread: false } } : d));
  });

  async function associate(p: { accountId: string | null; dealId: string | null; sharedWithAccount?: boolean }) {
    if (!threadId) return;
    await fetch(`/api/crm/correos/${threadId}/associate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    refresh();
  }

  if (!threadId) return null;
  const detailReady = detail && detailThreadId === threadId;
  const rawFrom =
    detailReady
      ? (detail.messages.find((m) => m.direction !== "out")?.fromEmail ??
        detail.messages[0]?.fromEmail ??
        "")
      : (preview?.fromEmail ?? "");
  const sender = parseSender(rawFrom);
  const from = sender.name || sender.email || rawFrom;
  const headerSubject =
    (detailReady ? detail.thread.subject : null) || preview?.subject || "Correo";
  const scrollToReply = () =>
    document.getElementById("correo-suggested-reply")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const requestReply = () => {
    setLocalComposeIntent({ mode: "reply", nonce: nextIntentNonce() });
    scrollToReply();
  };

  // Intent externo (atajo/menú) gana; si no, el pedido local de la barra móvil.
  const effectiveComposeIntent = composeIntent ?? localComposeIntent;

  return (
    <CorreoReaderShell
      open
      onClose={onClose}
      headerFrom={from}
      headerSubject={headerSubject}
      desktopWidth={desktopWidth}
      onResizePointerDown={onResizePointerDown}
      onResizeKeyDown={onResizeKeyDown}
      onResizeReset={onResizeReset}
      desktopMode={desktopMode}
      manageBackHistory={manageBackHistory}
      mobileActions={
        detailReady && canModify ? (
          <CorreoThreadActions
            threadId={detail.thread.id}
            isUnread={detail.thread.isUnread}
            archived={Boolean(detail.thread.archivedAt)}
            canModify
            variant="mobile-bar"
            onReply={requestReply}
            onClose={onClose}
            onRemove={onRemove}
            onRemoveDone={onRemoveDone}
            onUndoDone={onUndoDone}
            onSnooze={() => setSnoozeOpen(true)}
            onDone={refresh}
          />
        ) : null
      }
    >
      {loading && !detailReady ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <div className="h-1 w-24 overflow-hidden rounded-full bg-ds-surface-3">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
          </div>
          <p className="text-[12px] text-ds-text-4">Cargando correo…</p>
        </div>
      ) : !detailReady ? (
        <p className="text-[13px] text-ds-text-4">No se pudo cargar el hilo.</p>
      ) : (
        <CorreoDrawerContent
          detail={detail}
          mailboxEmail={mailboxEmail}
          canModify={canModify}
          onOpenAiLead={() => onOpenAiLead?.()}
          onAiCommand={onAiCommand}
          onAssociate={associate}
          onRefresh={refresh}
          onClose={onClose}
          onRemove={onRemove}
          onRemoveDone={onRemoveDone}
          onUndoDone={onUndoDone}
          onReply={scrollToReply}
          onSnooze={() => setSnoozeOpen(true)}
          alwaysShowImages={alwaysShowImages}
          onAlwaysShowImages={onAlwaysShowImages}
          shortcuts={shortcuts}
          workTabIntent={workTabIntent}
          composeIntent={effectiveComposeIntent}
        />
      )}
      <CorreoSnoozeSheet
        open={snoozeOpen}
        onClose={() => setSnoozeOpen(false)}
        onConfirm={(iso, label) => {
          if (!detailReady) return;
          const id = detail.thread.id;
          if (onRemove) onRemove(id);
          else onClose();
          void snoozeThread(id, iso, `Pospuesto hasta ${label}`, () => {
            onChanged?.();
          });
        }}
      />
    </CorreoReaderShell>
  );
}
