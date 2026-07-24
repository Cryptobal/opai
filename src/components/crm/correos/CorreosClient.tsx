"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive, Building2, CheckSquare, Clock, Forward, Link2, Mail, MailOpen,
  PenLine, Reply, Sparkles, Star, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Surface, EmptyState, Spinner } from "@/components/opai-ds";
import {
  type CorreoChipKey,
  type CorreoFolderTab,
} from "./CorreosFilters";
import { CorreosDesktopRail } from "./CorreosDesktopRail";
import { CorreosDesktopToolbar } from "./CorreosDesktopToolbar";
import { CorreosMobileTopBar } from "./CorreosMobileTopBar";
import { CorreosMobileDrawer } from "./CorreosMobileDrawer";
import { CorreoSwipeSettingsSheet } from "./CorreoSwipeSettingsSheet";
import { CorreoShortcutsSheet } from "./CorreoShortcutsSheet";
import { CorreoContextMenu, type CorreoMenuItem } from "./CorreoContextMenu";
import { CorreoSelectionBar } from "./CorreoSelectionBar";
import { CorreoRowSwipe } from "./CorreoRowSwipe";
import { CorreoDrawer } from "./CorreoDrawer";
import { CorreoSnoozeSheet } from "./CorreoSnoozeSheet";
import { CorreoComposeSheet } from "./CorreoComposeSheet";
import { CorreoScheduledList } from "./CorreoScheduledList";
import { runBulkCorreoAction } from "./CorreoBulkBar";
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
import { useCloseOnBack } from "./useCloseOnBack";
import { isUuid } from "@/lib/utils/uuid";

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
  // El estado real de conexión/permisos solo se conoce tras el primer fetch;
  // hasta entonces no mostramos el aviso amarillo "Reconectá Gmail" (evita el
  // parpadeo al entrar a Correo en móvil y desktop).
  const [statusReady, setStatusReady] = useState(false);
  const [backfillDone, setBackfillDone] = useState<boolean | null>(null);
  const [totalThreads, setTotalThreads] = useState(0);
  const [syncParked, setSyncParked] = useState(false);
  const [syncParkedReason, setSyncParkedReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [folder, setFolder] = useState<CorreoFolderTab>("inbox");
  const [chip, setChip] = useState<CorreoChipKey>("todos");
  const [query, setQuery] = useState("");
  // C15: la búsqueda consulta al servidor (toda la casilla), con debounce.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // A07: modo "buscar por significado" (retrieval vectorial).
  const [semantic, setSemantic] = useState(false);
  // A03: filtro por vertical de la clasificación v5.
  const [vertical, setVertical] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState(false);
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // Opción C: drawer lateral móvil (carpetas + filtros + acciones).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [swipeSettingsOpen, setSwipeSettingsOpen] = useState(false);
  const [shortcutsSheetOpen, setShortcutsSheetOpen] = useState(false);
  // Menú contextual (click derecho) desktop sobre una fila.
  const [ctxMenu, setCtxMenu] = useState<{ thread: CorreoThreadDTO; x: number; y: number } | null>(null);
  // v2: táctil (long-press/selección móvil); en desktop nada de esto aplica.
  const [isCoarse, setIsCoarse] = useState(false);
  useEffect(() => {
    setIsCoarse(typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  }, []);
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
    swipeConfig,
    setSwipeConfig,
    railCollapsed,
    setRailCollapsed,
    shortcuts,
    setShortcuts,
    alwaysShowImages,
    setAlwaysShowImages,
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
      if (vertical) qs.set("vertical", vertical);
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
      setStatusReady(true);
      setRealtimeChannel(
        typeof r.realtimeChannel === "string" ? r.realtimeChannel : null,
      );
      // Sin counts en la respuesta se conservan los últimos conocidos.
      if (r.counts != null) setCounts(r.counts as Counts);
      setBackfillDone(typeof r.backfillDone === "boolean" ? r.backfillDone : null);
      setLastSyncAt(typeof r.lastSyncAt === "string" ? r.lastSyncAt : null);
      if (r.totalThreads != null) setTotalThreads(Number(r.totalThreads) || 0);
      setSyncParked(r.syncParked === true);
      setSyncParkedReason(
        typeof (r as { syncParkedReason?: unknown }).syncParkedReason === "string"
          ? ((r as { syncParkedReason?: string }).syncParkedReason ?? null)
          : null,
      );
      setItems((prev) => (reset ? r.items ?? [] : [...prev, ...(r.items ?? [])]));
      setCursor(r.nextCursor ?? null);
      // C22b: snapshot de los últimos 50 hilos del inbox para modo offline.
      if (reset && f === "inbox" && !debouncedQuery && Array.isArray(r.items)) {
        void saveInboxSnapshot(r.items);
      }
    } finally {
      setLoading(false);
    }
  }, [folder, debouncedQuery, semantic, vertical]);

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
      // Deep-link `?thread=<uuid>` (p. ej. desde el detalle de una tarea): sólo
      // preseleccionamos si tiene forma de UUID. Un id de otro tenant no
      // devuelve datos porque el backend ya filtra por tenantId.
      const thread = current.get("thread");
      setOpenId(isUuid(thread) ? thread : null);
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

  function openThread(id: string, opts?: { extract?: boolean }) {
    openCorreoThreadInHistory(id, openId !== null);
    setOpenId(id);
    setAutoExtract(opts?.extract === true);
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
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);
  // v2: modo selección móvil (long-press / tap en avatar). Deriva del estado
  // existente — no hay un segundo estado de selección.
  const selectionMode = selectedIds.size > 0;
  // Gesto/botón atrás en móvil limpia la selección antes de salir de la vista
  // (misma pila LIFO que usa el lector). En desktop no se toca el historial.
  useCloseOnBack(isCoarse && selectionMode, clearSelection);
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
      // Base: la fila enfocada; si no hay, el hilo abierto (flechas con el
      // lector abierto); si tampoco, arranca desde el borde.
      const base =
        prev >= 0
          ? prev
          : openId !== null
            ? filtered.findIndex((t) => t.id === openId)
            : -1;
      const next = Math.min(Math.max(base < 0 ? 0 : base + delta, 0), filtered.length - 1);
      const t = filtered[next];
      if (t) {
        document
          .querySelector(`[data-correo-row="${t.id}"]`)
          ?.scrollIntoView({ block: "nearest" });
        // Con el lector abierto, navegar carga el hilo (flechas estilo Gmail).
        if (openId !== null) openThread(t.id);
      }
      return next;
    });
  }
  useCorreosKeyboard({
    enabled: !composeOpen && snoozeId === null && !shortcutsSheetOpen,
    shortcuts,
    onHelp: () => setShortcutsSheetOpen(true),
    onStar: () => {
      if (!focusedThread) return;
      const starred = Boolean(focusedThread.starredAt);
      void runCorreoAction(
        focusedThread.id,
        starred ? "unstar" : "star",
        starred ? "Quitado de Destacados" : "Destacado",
        () => void fetchPage(null, true),
        starred ? "star" : "unstar",
      );
    },
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

  // Ítems del menú contextual (click derecho, desktop) para un hilo. Reusa los
  // mismos helpers que el swipe/teclado; las acciones CRM abren el hilo (el
  // Panel comercial vive al fondo del lector; "Crear lead con IA" con extract).
  function contextItems(t: CorreoThreadDTO): CorreoMenuItem[] {
    const items: CorreoMenuItem[] = [
      {
        icon: <Reply className="h-4 w-4" />, label: "Responder",
        onClick: () => {
          openThread(t.id);
          window.setTimeout(
            () => document.getElementById("correo-suggested-reply")?.scrollIntoView({ block: "center" }),
            600,
          );
        },
      },
      { icon: <Forward className="h-4 w-4" />, label: "Reenviar", onClick: () => openThread(t.id) },
    ];
    if (canModify) {
      const unread = t.isUnread;
      const starred = Boolean(t.starredAt);
      items.push(
        {
          divider: true, icon: <Archive className="h-4 w-4" />, label: "Archivar",
          onClick: () => {
            removeThreadLocally(t.id);
            void runCorreoAction(t.id, "archive", "Archivado", () => void fetchPage(null, true), "unarchive");
          },
        },
        {
          icon: <Trash2 className="h-4 w-4" />, label: "Eliminar", danger: true,
          onClick: () => {
            removeThreadLocally(t.id);
            void runCorreoAction(t.id, "trash", "Movido a la Papelera", () => void fetchPage(null, true), "unarchive");
          },
        },
        {
          icon: unread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />,
          label: unread ? "Marcar leído" : "Marcar no leído",
          onClick: () => void runCorreoAction(
            t.id, unread ? "markRead" : "markUnread",
            unread ? "Marcado como leído" : "Marcado como no leído",
            () => void fetchPage(null, true),
          ),
        },
        {
          icon: <Star className="h-4 w-4" />, label: starred ? "Quitar destacado" : "Destacar",
          onClick: () => void runCorreoAction(
            t.id, starred ? "unstar" : "star",
            starred ? "Quitado de Destacados" : "Destacado",
            () => void fetchPage(null, true), starred ? "star" : "unstar",
          ),
        },
        { icon: <Clock className="h-4 w-4" />, label: "Posponer", onClick: () => setSnoozeId(t.id) },
      );
    }
    items.push(
      { divider: true, icon: <Sparkles className="h-4 w-4" />, label: "Crear lead con IA", onClick: () => openThread(t.id, { extract: true }) },
      { icon: <Building2 className="h-4 w-4" />, label: "Asociar cuenta", onClick: () => openThread(t.id) },
      { icon: <Link2 className="h-4 w-4" />, label: "Vincular instalación/factura", onClick: () => openThread(t.id) },
      { icon: <CheckSquare className="h-4 w-4" />, label: "Tareas", onClick: () => openThread(t.id) },
    );
    return items;
  }

  return (
    <>
      {/* Top móvil tipo Gmail — fuera del root animado para no correr el
          stagger de ds-page-enter en desktop; sticky contra el scroll de
          página en modo inmersivo. Con selección activa, la barra contextual
          ocupa el mismo slot sticky (como Gmail). */}
      {selectionMode ? (
        <CorreoSelectionBar
          count={selectedIds.size}
          allRead={items
            .filter((t) => selectedIds.has(t.id))
            .every((t) => !t.isUnread)}
          onClear={clearSelection}
          onAction={bulkAction}
          onSnooze={() => setSnoozeId("__bulk__")}
          onSelectAllVisible={() => setSelectedIds(new Set(filtered.map((t) => t.id)))}
        />
      ) : (
        <CorreosMobileTopBar
          onOpenNav={() => setMobileNavOpen(true)}
          query={query}
          onQuery={setQuery}
          semantic={semantic}
          onSemantic={setSemantic}
          inboxUnread={counts?.inboxUnread ?? 0}
        />
      )}
      <CorreosMobileDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        folder={folder}
        onFolder={setFolder}
        chip={chip}
        onChip={setChip}
        vertical={vertical}
        onVertical={setVertical}
        counts={counts}
        previewLines={previewLines}
        onPreviewLines={setPreviewLines}
        onSync={syncNow}
        syncing={syncing}
        realtimeStatus={realtimeStatus}
        lastSyncAt={lastSyncAt}
        onOpenSwipeSettings={() => setSwipeSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsSheetOpen(true)}
      />
      <CorreoSwipeSettingsSheet
        open={swipeSettingsOpen}
        onClose={() => setSwipeSettingsOpen(false)}
        config={swipeConfig}
        onConfig={setSwipeConfig}
      />
      <CorreoShortcutsSheet
        open={shortcutsSheetOpen}
        onClose={() => setShortcutsSheetOpen(false)}
        config={shortcuts}
        onConfig={setShortcuts}
      />
      <CorreoContextMenu
        anchor={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null}
        items={ctxMenu ? contextItems(ctxMenu.thread) : []}
        onClose={() => setCtxMenu(null)}
      />
    <div className="ds-page-enter space-y-5 max-lg:pb-28 lg:space-y-3">
      {/* Sin hero en desktop (rediseño Gmail): breadcrumb + tab ya ubican.
          Los banners de estado quedan como franjas delgadas arriba. */}
      <div className="space-y-5 max-lg:px-4 lg:space-y-3">
        <CorreosSyncBanner backfillDone={backfillDone} totalThreads={totalThreads}
          syncParked={syncParked} syncParkedReason={syncParkedReason}
          onConnected={() => void fetchPage(null, true)} />

        {offlineSince && (
          <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
            Sin conexión — mostrando correos guardados
            {offlineSince
              ? ` (actualizados ${new Date(offlineSince).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})`
              : ""}
            . Lo que hagas se aplicará al reconectar.
          </div>
        )}

        {statusReady && connected && !canModify && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
            <span>Reconectá Gmail para habilitar archivar y eliminar</span>
            <a href="/api/crm/gmail/connect" className="font-medium underline underline-offset-2">
              Reconectar Gmail
            </a>
          </div>
        )}
      </div>

      {/* C13: FAB móvil de composición (desktop usa Redactar en el riel).
          Con un hilo abierto el FAB se oculta: el lector es full-screen. */}
      {connected && !openId && (
        <button
          type="button"
          aria-label="Redactar correo"
          onClick={() => setComposeOpen(true)}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground shadow-lg ds-tap lg:hidden"
        >
          <PenLine className="h-4 w-4" /> Redactar
        </button>
      )}

      <div
        ref={workspaceRef}
        className="relative min-w-0 lg:flex lg:items-start lg:gap-3"
      >
        {/* Riel desktop contraíble (Gmail): carpetas + filtros + sync. */}
        <CorreosDesktopRail
          folder={folder} onFolder={setFolder}
          chip={chip} onChip={setChip}
          vertical={vertical} onVertical={setVertical}
          counts={counts}
          onCompose={() => setComposeOpen(true)}
          onSync={syncNow} syncing={syncing}
          realtimeStatus={realtimeStatus} lastSyncAt={lastSyncAt}
          collapsed={railCollapsed}
          onToggleCollapsed={() => setRailCollapsed(!railCollapsed)}
        />
        <div className="min-w-0 flex-1 space-y-4 max-lg:px-4 lg:space-y-3">
          {/* Toolbar desktop: búsqueda/refresh/densidad; con selección muta a
              acciones masivas (reemplaza a CorreoBulkBar en desktop). */}
          <CorreosDesktopToolbar
            canModify={canModify}
            allChecked={filtered.length > 0 && selectedIds.size === filtered.length}
            onToggleAll={() =>
              filtered.length > 0 && selectedIds.size === filtered.length
                ? clearSelection()
                : setSelectedIds(new Set(filtered.map((t) => t.id)))
            }
            onRefresh={syncNow}
            syncing={syncing}
            query={query} onQuery={setQuery}
            semantic={semantic} onSemantic={setSemantic}
            shownCount={filtered.length}
            totalCount={counts ? ((counts as Record<string, number | undefined>)[folder] ?? null) : null}
            previewLines={previewLines} onPreviewLines={setPreviewLines}
            selectedCount={selectedIds.size}
            allReadSelected={items
              .filter((t) => selectedIds.has(t.id))
              .every((t) => !t.isUnread)}
            onClear={clearSelection}
            onAction={bulkAction}
            onSnooze={() => setSnoozeId("__bulk__")}
          />
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
            <Surface
              elevation={1}
              padding="none"
              className="overflow-hidden max-lg:-mx-4 max-lg:rounded-none max-lg:border-x-0"
              onContextMenu={(e) => {
                // Click derecho sobre una fila (desktop): menú contextual.
                const rowEl = (e.target as HTMLElement).closest?.("[data-correo-row]");
                const id = rowEl?.getAttribute("data-correo-row");
                const t = id ? filtered.find((x) => x.id === id) : null;
                if (!t) return;
                e.preventDefault();
                setCtxMenu({ thread: t, x: e.clientX, y: e.clientY });
              }}
            >
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
                  onAvatarPress={canModify ? () => toggleSelect(t.id) : undefined}
                  onLongPress={canModify ? () => toggleSelect(t.id) : undefined}
                  selectionMode={selectionMode}
                  previewLines={previewLines}
                  swipeConfig={swipeConfig}
                  onChanged={() => void fetchPage(null, true)}
                  onRemove={removeThreadLocally}
                  onSnooze={() => setSnoozeId(t.id)}
                  onOpen={() =>
                    // Solo táctil: en selección el tap alterna. En desktop el
                    // click sigue abriendo el hilo aunque haya checkboxes
                    // marcados (comportamiento histórico intacto).
                    selectionMode && isCoarse ? toggleSelect(t.id) : openThread(t.id)
                  } />
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
          alwaysShowImages={alwaysShowImages}
          onAlwaysShowImages={() => setAlwaysShowImages(true)}
          onClose={closeThread}
          onChanged={() => void fetchPage(null, true)} />
      </div>

    </div>
      {/* Fuera del root animado: los hijos de ds-page-enter retienen un
          transform (fill forwards) que dejaría estos overlays anclados al
          contenido y bajo la BottomNav en móvil. Aquí su fixed es viewport
          real; en desktop no cambia nada (son modales). */}
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
    </>
  );
}
