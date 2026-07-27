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
};

export function CorreoDrawer({
  threadId,
  preview = null,
  mailboxEmail = null,
  onClose,
  onChanged,
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
}: Props) {
  const [detail, setDetail] = useState<CorreoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  // Evita reutilizar el detalle del hilo anterior al cambiar de correo.
  const detailThreadId = detail?.thread.id ?? null;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!threadId) return;
    // `silent`: refresh en vivo (mailbox-changed / foco). No muestra spinner ni
    // vacía el detalle si la respuesta falla, para no parpadear el lector
    // mientras se está leyendo el correo.
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`/api/crm/correos/${threadId}`);
      const data = r.ok ? ((await r.json()) as CorreoDetail) : null;
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
        setDetail(await loadOfflineDetail(threadId));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [threadId]);

  // Carga inicial / cambio de hilo: pintamos al instante desde IndexedDB
  // (si hay) y pedimos la red en paralelo. El header ya usa `preview` de la lista.
  useEffect(() => {
    setDetail((prev) => (prev?.thread.id === threadId ? prev : null));
    setAiOpen(false);
    if (!threadId) return;
    let cancelled = false;
    void loadOfflineDetail(threadId).then((cached) => {
      if (cancelled || !cached) return;
      setDetail((prev) => (prev?.thread.id === threadId ? prev : cached));
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
    if (autoExtract && detail && !detail.thread.leadId) setAiOpen(true);
  }, [autoExtract, detail]);

  const refresh = useCallback(() => {
    void load();
    onChanged?.();
  }, [load, onChanged]);

  useMarkCorreoRead(threadId, detail?.thread.isUnread, canModify, () => {
    setDetail((d) => (d ? { ...d, thread: { ...d.thread, isUnread: false } } : d));
    onChanged?.();
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
            onReply={scrollToReply}
            onClose={onClose}
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
          aiOpen={aiOpen}
          setAiOpen={setAiOpen}
          onAssociate={associate}
          onRefresh={refresh}
          onClose={onClose}
          onReply={scrollToReply}
          onSnooze={() => setSnoozeOpen(true)}
          alwaysShowImages={alwaysShowImages}
          onAlwaysShowImages={onAlwaysShowImages}
        />
      )}
      <CorreoSnoozeSheet
        open={snoozeOpen}
        onClose={() => setSnoozeOpen(false)}
        onConfirm={(iso, label) => {
          if (!detailReady) return;
          void snoozeThread(detail.thread.id, iso, `Pospuesto hasta ${label}`, () => {
            onChanged?.();
          });
          onClose();
        }}
      />
    </CorreoReaderShell>
  );
}
