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
import { CorreoReaderMobileHeader } from "./CorreoReaderMobileHeader";
import { CorreoReaderOverflowMenu } from "./CorreoReaderOverflowMenu";
import { CorreoReaderIsland } from "./CorreoReaderIsland";
import { CorreoSnoozeSheet } from "./CorreoSnoozeSheet";
import { snoozeThread } from "./correo-thread-action-client";
import { useMarkCorreoRead } from "./useMarkCorreoRead";
import { parseSender } from "./correo-sender";
import { loadOfflineDetail } from "./offline-store";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import type { CorreoShortcuts, CorreoSnoozeConfig } from "./useCorreosViewPreferences";
import { nextIntentNonce, type ComposeIntent } from "./correo-reader-intent";
import type { ComposerMode } from "./CorreoComposerBox";
import type { CorreoPrimaryAction } from "./correo-primary-action";
import { toast } from "sonner";

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
  desktopMode?: "split" | "contained" | "overlay";
  manageBackHistory?: boolean;
  alwaysShowImages?: boolean;
  onAlwaysShowImages?: () => void;
  snoozeConfig?: CorreoSnoozeConfig;
  onOpenSnoozeSettings?: () => void;
  shortcuts?: CorreoShortcuts;
  workTabIntent?: { tab: import("./work-panel-tabs").WorkTab; nonce: number } | null;
  composeIntent?: ComposeIntent | null;
  onOpenAiLead?: () => void;
  onAiCommand?: (commandId: import("@/modules/crm/email/correo-ai-commands").CorreoAiCommandId) => void;
  onOpenAiMenu?: () => void;
  onOpenAiStyle?: () => void;
  onOpenSignature?: () => void;
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
  snoozeConfig,
  onOpenSnoozeSettings,
  shortcuts,
  workTabIntent = null,
  composeIntent = null,
  onOpenAiLead,
  onAiCommand,
  onOpenAiMenu,
  onOpenAiStyle,
  onOpenSignature,
}: Props) {
  const [detail, setDetail] = useState<CorreoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  /** Pedido local (isla móvil Responder/Reenviar) sin pasar por CorreosClient. */
  const [localComposeIntent, setLocalComposeIntent] = useState<ComposeIntent | null>(null);
  /** Acción primaria resuelta (elevada desde CorreoReplyBox) para la isla. */
  const [primaryAction, setPrimaryAction] = useState<CorreoPrimaryAction | null>(null);
  /** Composer abierto → la isla de acciones se oculta (exclusividad). */
  const [composerOpen, setComposerOpen] = useState(false);
  // Evita reutilizar el detalle del hilo anterior al cambiar de correo.
  const detailThreadId = detail?.thread.id ?? null;
  // Guarda el hilo pedido para descartar respuestas stale (p. ej. onDone de
  // archivar que llega después de avanzar al siguiente correo).
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
  /** Cursor de lectura capturado la primera vez que llega el detalle del hilo
   *  (antes del markRead). Las recargas silenciosas no lo pisan. */
  const [readCursorAt, setReadCursorAt] = useState<string | null>(null);
  const readCursorCapturedRef = useRef(false);

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
    setPrimaryAction(null);
    setComposerOpen(false);
    setReadCursorAt(null);
    readCursorCapturedRef.current = false;
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

  // Captura lastReadAt la primera vez que llega detalle de red para este hilo.
  // El markRead corre después (useMarkCorreoRead espera detail !== null).
  // Ignora caché offline incompleta (sin threadSummary) para no sellar null
  // antes de que llegue el lastReadAt real.
  useEffect(() => {
    if (!detail || detail.thread.id !== threadId || readCursorCapturedRef.current) return;
    if (!("threadSummary" in detail.thread)) return;
    setReadCursorAt(detail.thread.lastReadAt ?? null);
    readCursorCapturedRef.current = true;
  }, [detail, threadId]);
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

  async function associate(p: {
    accountId: string | null;
    dealId: string | null;
    sharedWithAccount?: boolean;
  }): Promise<void> {
    if (!threadId) return;
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/associate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "No se pudo guardar la asociación",
        );
      }
      // Actualización optimista del detalle local para que Copiloto/Cuenta
      // muestren cuenta/negocio sin esperar el re-fetch completo.
      setDetail((d) =>
        d
          ? {
              ...d,
              thread: {
                ...d.thread,
                accountId: body.accountId ?? null,
                accountName: body.accountName ?? null,
                dealId: body.dealId ?? null,
                dealTitle: body.dealTitle ?? null,
                dealStageName:
                  typeof body.dealStageName === "string"
                    ? body.dealStageName
                    : d.thread.dealStageName,
                sharedWithAccount:
                  typeof body.sharedWithAccount === "boolean"
                    ? body.sharedWithAccount
                    : d.thread.sharedWithAccount,
              },
            }
          : d,
      );
      await Promise.resolve(refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la asociación");
      await Promise.resolve(refresh());
    }
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
  const scrollToReply = () => {
    const run = () => {
      const el = document.getElementById("correo-suggested-reply");
      if (!el) return;
      const scroller = el.closest(".overflow-y-auto");
      if (scroller instanceof HTMLElement) {
        const elRect = el.getBoundingClientRect();
        const scRect = scroller.getBoundingClientRect();
        const nextTop = scroller.scrollTop + (elRect.bottom - scRect.bottom) + 24;
        scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "end" });
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
    window.setTimeout(run, 80);
  };

  const requestCompose = (mode: ComposerMode, ai = false) => {
    setLocalComposeIntent({ mode, ai, nonce: nextIntentNonce() });
    scrollToReply();
  };
  const requestReply = () => requestCompose("reply");

  // Posponer: mismo efecto que el sheet (sale de INBOX + Deshacer). Compartido
  // por el sheet «Elegir fecha…» y los presets rápidos de la isla.
  const handleSnoozeConfirm = (iso: string, label: string) => {
    if (!detailReady) return;
    const id = detail.thread.id;
    if (onRemove) onRemove(id);
    else onClose();
    void snoozeThread(id, iso, `Pospuesto hasta ${label}`, () => {
      onChanged?.();
    });
  };

  // Intent externo (atajo/menú) gana; si no, el pedido local de la isla móvil.
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
      mobileHeader={
        <CorreoReaderMobileHeader
          subject={headerSubject}
          messageCount={detailReady ? detail.messages.length : 0}
          accountName={detailReady ? detail.thread.accountName : null}
          dealTitle={detailReady ? detail.thread.dealTitle : null}
          snoozedUntil={detailReady ? detail.thread.snoozedUntil : null}
          onClose={onClose}
          moreSlot={
            detailReady ? (
              <CorreoReaderOverflowMenu
                threadId={detail.thread.id}
                providerThreadId={detail.thread.providerThreadId}
                onOpenSignature={onOpenSignature}
                onOpenAiStyle={onOpenAiStyle}
              />
            ) : undefined
          }
        />
      }
      mobileActions={
        detailReady && canModify ? (
          <CorreoReaderIsland
            threadId={detail.thread.id}
            isUnread={detail.thread.isUnread}
            archived={Boolean(detail.thread.archivedAt)}
            trashed={Boolean(detail.thread.trashedAt)}
            snoozedUntil={detail.thread.snoozedUntil}
            primaryAction={primaryAction}
            composerOpen={composerOpen}
            snoozeConfig={snoozeConfig}
            onCompose={requestCompose}
            onSnoozeConfirm={handleSnoozeConfirm}
            onOpenSnoozeSheet={() => setSnoozeOpen(true)}
            onClose={onClose}
            onRemove={onRemove}
            onRemoveDone={onRemoveDone}
            onUndoDone={onUndoDone}
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
        <p className="text-ds-body text-ds-text-4">No se pudo cargar el hilo.</p>
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
          onRequestReply={requestReply}
          onSnooze={() => setSnoozeOpen(true)}
          alwaysShowImages={alwaysShowImages}
          onAlwaysShowImages={onAlwaysShowImages}
          shortcuts={shortcuts}
          workTabIntent={workTabIntent}
          composeIntent={effectiveComposeIntent}
          readCursorAt={readCursorAt}
          dataRevision={refreshToken}
          onOpenAiStyle={onOpenAiStyle}
          onOpenSignature={onOpenSignature}
          onPrimaryActionChange={setPrimaryAction}
          onComposerOpenChange={setComposerOpen}
        />
      )}
      <CorreoSnoozeSheet
        open={snoozeOpen}
        onClose={() => setSnoozeOpen(false)}
        config={snoozeConfig}
        onOpenSettings={onOpenSnoozeSettings}
        onConfirm={handleSnoozeConfirm}
      />
    </CorreoReaderShell>
  );
}
