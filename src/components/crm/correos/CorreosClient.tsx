"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mail, PenLine } from "lucide-react";
import { toast } from "sonner";
import { PageHero, Surface, EmptyState, Spinner } from "@/components/opai-ds";
import {
  CorreosFilters,
  type CorreoChipKey,
  type CorreoFolderTab,
} from "./CorreosFilters";
import { CorreoRowSwipe } from "./CorreoRowSwipe";
import { CorreoDrawer } from "./CorreoDrawer";
import { CorreoSnoozeSheet } from "./CorreoSnoozeSheet";
import { CorreoComposeSheet } from "./CorreoComposeSheet";
import { CorreoScheduledList } from "./CorreoScheduledList";
import { CorreoBulkBar, runBulkCorreoAction } from "./CorreoBulkBar";
import { useCorreosKeyboard } from "./useCorreosKeyboard";
import { runCorreoAction } from "./correo-thread-action-client";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";
import {
  flushOfflineActions,
  flushOfflineSends,
  loadInboxSnapshot,
  saveInboxSnapshot,
} from "./offline-store";
import { CorreosSyncBanner } from "./CorreosSyncBanner";
import { snoozeThread } from "./correo-thread-action-client";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import { useCorreosRealtime } from "./useCorreosRealtime";
import { useCorreosViewPreferences } from "./useCorreosViewPreferences";
import {
  closeCorreoThreadInHistory,
  openCorreoThreadInHistory,
} from "./correo-thread-history";

function matchesChip(t: CorreoThreadDTO, f: CorreoChipKey): boolean {
  if (f === "con_cuenta") return Boolean(t.accountId);
  if (f === "sin_asociar") return !t.accountId;
  if (f === "con_adjuntos") return t.attachmentCount > 0;
  if (f === "leads_creados") return Boolean(t.leadId);
  return true;
}

type Counts = {
  inbox: number;
  inboxUnread?: number;
  archived: number;
  all: number;
  trash: number;
  snoozed: number;
} | null;

export function CorreosClient() {
  const [items, setItems] = useState<CorreoThreadDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>(null);
  const [connected, setConnected] = useState(true);
  const [canModify, setCanModify] = useState(false);
  const [backfillDone, setBackfillDone] = useState<boolean | null>(null);
  const [totalThreads, setTotalThreads] = useState(0);
  const [syncParked, setSyncParked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [folder, setFolder] = useState<CorreoFolderTab>("inbox");
  const [chip, setChip] = useState<CorreoChipKey>("todos");
  const [query, setQuery] = useState("");
  // C15: la búsqueda consulta al servidor (toda la casilla), con debounce.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // A07: modo "buscar por significado" (retrieval vectorial).
  const [semantic, setSemantic] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState(false);
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // C12: multi-select para acciones masivas. C20: fila enfocada por j/k.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusIndex, setFocusIndex] = useState(-1);
  // C22b: modo sin conexión — snapshot local + fecha del último guardado.
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [realtimeChannel, setRealtimeChannel] = useState<string | null>(null);
  const [realtimeRevision, setRealtimeRevision] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const {
    panelWidth,
    previewLines,
    setPreviewLines,
    resetPanelWidth,
    onResizePointerDown,
    onResizeKeyDown,
  } = useCorreosViewPreferences(workspaceRef);

  const fetchPage = useCallback(async (
    cur: string | null,
    reset: boolean,
    nextFolder?: CorreoFolderTab,
  ) => {
    setLoading(true);
    try {
      const f = nextFolder ?? folder;
      const qs = new URLSearchParams();
      if (cur) qs.set("cursor", cur);
      if (f !== "inbox") qs.set("folder", f);
      if (debouncedQuery) qs.set("q", debouncedQuery);
      if (debouncedQuery && semantic) qs.set("mode", "semantic");
      // C18: counts solo en cargas "reset" sin búsqueda activa (carga inicial,
      // cambio de carpeta, invalidación realtime) — tipear o paginar no los paga.
      const wantCounts = reset && !cur && !debouncedQuery;
      if (wantCounts) qs.set("counts", "1");
      let r: Record<string, unknown> & {
        connected?: boolean;
        canModify?: boolean;
        realtimeChannel?: unknown;
        counts?: unknown;
        backfillDone?: unknown;
        lastSyncAt?: unknown;
        totalThreads?: unknown;
        syncParked?: unknown;
        items?: CorreoThreadDTO[];
        nextCursor?: string | null;
      };
      try {
        r = await fetch(`/api/crm/correos?${qs}`).then((x) => x.json());
        setOfflineSince(null);
      } catch {
        // C22b: sin red — servir el snapshot local del inbox con banner.
        if (reset && f === "inbox" && !debouncedQuery) {
          const snapshot = await loadInboxSnapshot();
          if (snapshot) {
            setItems(snapshot.items);
            setCursor(null);
            setOfflineSince(snapshot.savedAt);
            return;
          }
        }
        setOfflineSince(new Date().toISOString());
        return;
      }
      setConnected(r.connected !== false);
      setCanModify(Boolean(r.canModify));
      setRealtimeChannel(
        typeof r.realtimeChannel === "string" ? r.realtimeChannel : null,
      );
      // Sin counts en la respuesta se conservan los últimos conocidos.
      if (r.counts != null) setCounts(r.counts as Counts);
      setBackfillDone(typeof r.backfillDone === "boolean" ? r.backfillDone : null);
      setLastSyncAt(typeof r.lastSyncAt === "string" ? r.lastSyncAt : null);
      if (r.totalThreads != null) setTotalThreads(Number(r.totalThreads) || 0);
      setSyncParked(r.syncParked === true);
      setItems((prev) => (reset ? r.items ?? [] : [...prev, ...(r.items ?? [])]));
      setCursor(r.nextCursor ?? null);
      // C22b: snapshot de los últimos 50 hilos del inbox para modo offline.
      if (reset && f === "inbox" && !debouncedQuery && Array.isArray(r.items)) {
        void saveInboxSnapshot(r.items);
      }
    } finally {
      setLoading(false);
    }
  }, [folder, debouncedQuery, semantic]);

  // C22b: al reconectar, reconciliar acciones y envíos encolados offline.
  useEffect(() => {
    const flush = async () => {
      const [actions, sends] = await Promise.all([
        flushOfflineActions(),
        flushOfflineSends(),
      ]);
      if (actions > 0 || sends > 0) {
        toast.success(
          [
            actions > 0 ? `${actions} acción(es) aplicadas` : null,
            sends > 0 ? `${sends} correo(s) enviados` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        );
        void fetchPage(null, true);
      }
    };
    window.addEventListener("online", flush);
    // También al montar (la app pudo reabrirse ya online con cola pendiente).
    void flush();
    return () => window.removeEventListener("online", flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const syncThreadFromUrl = () => {
      const current = new URLSearchParams(window.location.search);
      setOpenId(current.get("thread"));
      setAutoExtract(current.get("extract") === "1");
    };
    syncThreadFromUrl();
    // Deep-link del command palette: abrir el composer directo.
    if (sp.get("compose") === "1") setComposeOpen(true);
    // Deep-links: "archived" ya no es pestaña → normalizar a "Todos".
    const f = sp.get("folder");
    if (f === "archived") setFolder("all");
    else if (
      f === "all" ||
      f === "trash" ||
      f === "inbox" ||
      f === "snoozed" ||
      f === "sent" ||
      f === "drafts" ||
      f === "spam" ||
      f === "starred" ||
      f === "scheduled"
    ) {
      setFolder(f);
    }
    window.addEventListener("popstate", syncThreadFromUrl);
    return () => window.removeEventListener("popstate", syncThreadFromUrl);
  }, []);

  useEffect(() => {
    void fetchPage(null, true, folder);
  }, [fetchPage, folder]);

  const lastRefreshAtRef = useRef(0);
  const refreshMailbox = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      lastRefreshAtRef.current = Date.now();
      setRealtimeRevision((value) => value + 1);
      void fetchPage(null, true);
    }, 150);
  }, [fetchPage]);
  const realtimeStatus = useCorreosRealtime(
    realtimeChannel,
    refreshMailbox,
  );

  useEffect(() => {
    // C18: revalidación condicional — con realtime vivo, focus/online no
    // re-descargan lista+counts si hubo refresh hace <30 s (el canal Pusher
    // ya habría avisado cualquier cambio). Sin realtime, se refresca igual.
    const refreshVisible = () => {
      if (document.visibilityState !== "visible") return;
      const fresh = Date.now() - lastRefreshAtRef.current < 30_000;
      if (realtimeStatus === "live" && fresh) return;
      refreshMailbox();
    };
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("online", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const interval =
      realtimeStatus === "fallback"
        ? window.setInterval(refreshVisible, 30_000)
        : null;
    return () => {
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      if (interval != null) window.clearInterval(interval);
    };
  }, [realtimeStatus, refreshMailbox]);

  useEffect(
    () => () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    },
    [],
  );

  async function syncNow() {
    setSyncing(true);
    try {
      // force=1: sweep INBOX/TRASH + self-heal para reparar Recibidos vacío.
      const r = await fetch("/api/crm/gmail/sync?force=1", { method: "POST" }).then((x) => x.json());
      if (!r.success) {
        toast.error(r.error || "No se pudo sincronizar");
      } else if (r.queued) {
        toast.message("La casilla ya se está sincronizando; se actualizará en vivo");
      } else {
        const neu = Number(r.syncedCount) || 0;
        const upd = Math.max((Number(r.fetched) || 0) - neu, 0);
        const healed = Number(r.healed) || 0;
        toast.success(`${neu} hilos nuevos · ${upd} actualizados`);
        if (healed > 0) {
          toast.message(`${healed} correos restaurados a Recibidos`);
        }
        if (r.backfillDone === false) {
          toast.message(`Importación inicial en progreso (${r.totalThreads ?? 0} hilos)`);
        }
      }
      await fetchPage(null, true);
    } catch {
      toast.error("No se pudo sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  /** Remoción optimista tras archivar/eliminar; los counts se corrigen al revalidar. */
  function removeThreadLocally(id: string) {
    setItems((prev) => prev.filter((t) => t.id !== id));
    setCounts((c) =>
      c ? { ...c, inbox: Math.max(0, c.inbox - 1), all: Math.max(0, c.all - 1) } : c,
    );
  }

  function openThread(id: string) {
    openCorreoThreadInHistory(id, openId !== null);
    setOpenId(id);
    setAutoExtract(false);
  }

  function closeThread() {
    if (closeCorreoThreadInHistory() === "replaced") {
      setOpenId(null);
      setAutoExtract(false);
    }
  }

  // La búsqueda ya viene filtrada del servidor; los chips siguen siendo
  // client-side (filtran metadata de asociación ya presente en la página).
  const filtered = items.filter((t) => matchesChip(t, chip));
  const searching = debouncedQuery.length > 0;

  // ── C12: selección múltiple + acciones masivas ──
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }
  function bulkAction(
    action: CorreoAction,
    okMsg: string,
    opts?: { undo?: CorreoAction; removes?: boolean },
  ) {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0) return;
    if (opts?.removes) {
      setItems((prev) => prev.filter((t) => !selectedIds.has(t.id)));
    }
    clearSelection();
    runBulkCorreoAction({
      threadIds,
      action,
      okMsg,
      undo: opts?.undo,
      onDone: () => void fetchPage(null, true),
    });
  }

  // ── C20: navegación y acciones por teclado sobre la fila enfocada ──
  const focusedThread = focusIndex >= 0 ? filtered[focusIndex] : undefined;
  function moveFocus(delta: number) {
    if (filtered.length === 0) return;
    setFocusIndex((prev) => {
      const next = Math.min(Math.max(prev + delta, 0), filtered.length - 1);
      const id = filtered[next]?.id;
      if (id) {
        document
          .querySelector(`[data-correo-row="${id}"]`)
          ?.scrollIntoView({ block: "nearest" });
      }
      return next;
    });
  }
  useCorreosKeyboard({
    enabled: !composeOpen && snoozeId === null,
    onDown: () => moveFocus(1),
    onUp: () => moveFocus(-1),
    onOpen: () => focusedThread && openThread(focusedThread.id),
    onToggleSelect: () => focusedThread && toggleSelect(focusedThread.id),
    onArchive: () => {
      if (selectedIds.size > 0) {
        bulkAction("archive", "Archivados", { undo: "unarchive", removes: true });
      } else if (focusedThread) {
        removeThreadLocally(focusedThread.id);
        void runCorreoAction(
          focusedThread.id,
          "archive",
          "Archivado",
          () => void fetchPage(null, true),
          "unarchive",
        );
      }
    },
    onReply: () => {
      if (!focusedThread) return;
      openThread(focusedThread.id);
      window.setTimeout(() => {
        document
          .getElementById("correo-suggested-reply")
          ?.scrollIntoView({ block: "center" });
      }, 600);
    },
    onTrash: () => {
      if (selectedIds.size > 0) {
        bulkAction("trash", "Movidos a la Papelera", { undo: "unarchive", removes: true });
      } else if (focusedThread) {
        removeThreadLocally(focusedThread.id);
        void runCorreoAction(
          focusedThread.id,
          "trash",
          "Movido a la Papelera",
          () => void fetchPage(null, true),
          "unarchive",
        );
      }
    },
    onSnooze: () => {
      if (selectedIds.size > 0) setSnoozeId("__bulk__");
      else if (focusedThread) setSnoozeId(focusedThread.id);
    },
    onToggleRead: () => {
      if (!focusedThread) return;
      void runCorreoAction(
        focusedThread.id,
        focusedThread.isUnread ? "markRead" : "markUnread",
        focusedThread.isUnread ? "Marcado como leído" : "Marcado como no leído",
        () => void fetchPage(null, true),
      );
    },
    onFocusSearch: () => document.getElementById("correos-search-input")?.focus(),
  });

  return (
    <div className="ds-page-enter space-y-5">
      {/* El encabezado se desplaza con el scroll: recupera pantalla en móvil
          (antes todo el hero quedaba fijo y solo scrolleaba la lista). */}
      <div className="space-y-5">
        <PageHero icon={Mail} iconTone="violet" title="Correos" subtitle="Bandeja comercial"
          description="Hilos de tu Gmail vinculados a cuentas, negocios y leads" />

        <CorreosSyncBanner backfillDone={backfillDone} totalThreads={totalThreads}
          syncParked={syncParked} onConnected={() => void fetchPage(null, true)} />

        {offlineSince && (
          <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
            Sin conexión — mostrando correos guardados
            {offlineSince
              ? ` (actualizados ${new Date(offlineSince).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})`
              : ""}
            . Lo que hagas se aplicará al reconectar.
          </div>
        )}

        {connected && !canModify && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
            <span>Reconectá Gmail para habilitar archivar y eliminar</span>
            <a href="/api/crm/gmail/connect" className="font-medium underline underline-offset-2">
              Reconectar Gmail
            </a>
          </div>
        )}
      </div>

      {/* Solo los filtros quedan fijos bajo la isla móvil: tabs siempre a mano
          sin el bloque grande del hero robando espacio. */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-10 -mx-1 bg-background/80 px-1 py-2 backdrop-blur-sm lg:static lg:top-auto lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
        <CorreosFilters folder={folder} onFolder={setFolder} chip={chip} onChip={setChip}
          counts={counts} query={query} onQuery={setQuery}
          semantic={semantic} onSemantic={setSemantic}
          onSync={syncNow} syncing={syncing}
          realtimeStatus={realtimeStatus} previewLines={previewLines}
          onPreviewLines={setPreviewLines} lastSyncAt={lastSyncAt} />
      </div>

      {connected && (
        <>
          {/* C13: composición nueva desde la bandeja — botón desktop + FAB móvil. */}
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="hidden h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-[13px] font-medium text-primary-foreground ds-tap lg:inline-flex"
          >
            <PenLine className="h-4 w-4" /> Redactar
          </button>
          <button
            type="button"
            aria-label="Redactar correo"
            onClick={() => setComposeOpen(true)}
            className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground shadow-lg ds-tap lg:hidden"
          >
            <PenLine className="h-4 w-4" /> Redactar
          </button>
        </>
      )}

      <div
        ref={workspaceRef}
        className="relative min-w-0 lg:flex lg:items-start lg:gap-4"
      >
        <div className="min-w-0 flex-1 space-y-4">
          {selectedIds.size > 0 && (
            <CorreoBulkBar
              count={selectedIds.size}
              onClear={clearSelection}
              onSelectAllVisible={() => setSelectedIds(new Set(filtered.map((t) => t.id)))}
              onAction={bulkAction}
              onSnooze={() => setSnoozeId("__bulk__")}
            />
          )}
          {!connected ? (
            <EmptyState icon={Mail} title="Conectá tu Gmail" description="Conectá tu casilla en Integraciones." />
          ) : folder === "scheduled" ? (
            /* PR-12: Programados se alimenta del outbox, no de hilos. */
            <CorreoScheduledList refreshToken={realtimeRevision} />
          ) : loading && items.length === 0 ? (
            <Spinner className="mx-auto" />
          ) : filtered.length === 0 ? (
            searching ? (
              <EmptyState icon={Mail} title="Sin resultados" description="Nada coincide con tu búsqueda en esta carpeta. Probá otros términos u operadores (from:, to:, domain:, before:, after:, has:attachment)." />
            ) : (
              <EmptyState icon={Mail} title="Sin correos" description="Probá sincronizar o cambiá los filtros." />
            )
          ) : (
            <Surface elevation={1} padding="none" className="overflow-hidden">
              {searching && loading && (
                <div className="flex items-center gap-2 border-b border-ds-border-subtle px-4 py-2 text-[12px] text-ds-text-3">
                  <Spinner className="h-3.5 w-3.5" /> Buscando en toda la casilla…
                </div>
              )}
              {filtered.map((t, index) => (
                <CorreoRowSwipe key={t.id} thread={t} canModify={canModify}
                  selected={openId === t.id}
                  focused={focusIndex === index}
                  checked={selectedIds.has(t.id)}
                  onToggleCheck={canModify ? () => toggleSelect(t.id) : undefined}
                  previewLines={previewLines}
                  onChanged={() => void fetchPage(null, true)}
                  onRemove={removeThreadLocally}
                  onSnooze={() => setSnoozeId(t.id)}
                  onOpen={() => openThread(t.id)} />
              ))}
            </Surface>
          )}

          {cursor && (
            <div className="flex justify-center">
              <button type="button" onClick={() => void fetchPage(cursor, false)} disabled={loading}
                className="h-10 rounded-xl border border-ds-border-default px-4 text-[13px] ds-tap disabled:opacity-50 sm:h-9">
                {loading ? "Cargando…" : "Cargar más"}
              </button>
            </div>
          )}
        </div>

        <CorreoDrawer threadId={openId} autoExtract={autoExtract} canModify={canModify}
          refreshToken={realtimeRevision}
          desktopWidth={panelWidth}
          onResizePointerDown={onResizePointerDown}
          onResizeKeyDown={onResizeKeyDown}
          onResizeReset={resetPanelWidth}
          desktopMode="split"
          manageBackHistory={false}
          onClose={closeThread}
          onChanged={() => void fetchPage(null, true)} />
      </div>

      <CorreoComposeSheet
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={() => void fetchPage(null, true)}
      />

      <CorreoSnoozeSheet
        open={snoozeId !== null}
        onClose={() => setSnoozeId(null)}
        onConfirm={(iso, label) => {
          const id = snoozeId;
          if (!id) return;
          // C12: "__bulk__" pospone toda la selección en un solo request.
          if (id === "__bulk__") {
            const threadIds = Array.from(selectedIds);
            setItems((prev) => prev.filter((t) => !selectedIds.has(t.id)));
            clearSelection();
            runBulkCorreoAction({
              threadIds,
              action: "snooze",
              okMsg: `Pospuestos hasta ${label}`,
              undo: "unsnooze",
              snoozeUntil: iso,
              onDone: () => void fetchPage(null, true),
            });
            return;
          }
          removeThreadLocally(id);
          void snoozeThread(id, iso, `Pospuesto hasta ${label}`, () => void fetchPage(null, true));
        }}
      />
    </div>
  );
}
