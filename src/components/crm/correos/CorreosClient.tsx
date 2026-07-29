"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, Building2, CalendarPlus, CheckSquare, Clock, Forward, Link2,
  ListTodo, Mail, MailOpen, Menu, PenLine, Reply, ReplyAll, Sparkles, Star,
  TicketPlus, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Surface,
  EmptyState,
  Spinner,
  useSetIslandModuleMenu,
  useSetIslandSearch,
  useSetIslandSuppressed,
} from "@/components/opai-ds";
import {
  type CorreoChipKey,
  type CorreoFolderTab,
} from "./CorreosFilters";
import { CorreosDesktopRail } from "./CorreosDesktopRail";
import { CorreosDesktopToolbar } from "./CorreosDesktopToolbar";
import { CorreoSearchChips } from "./CorreoSearchChips";
import {
  CorreoIndexCoverageBar,
  type IndexCoverage,
} from "./CorreoIndexCoverageBar";
import { useCorreoFocusScope } from "./useCorreoFocusScope";
import { CorreosMobileDrawer } from "./CorreosMobileDrawer";
import { CorreosPullToRefresh } from "./CorreosPullToRefresh";
import { CorreoSwipeSettingsSheet } from "./CorreoSwipeSettingsSheet";
import { CorreoSnoozeSettingsSheet } from "./CorreoSnoozeSettingsSheet";
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
import { useCorreosViewPreferences, focusCorreosSearch } from "./useCorreosViewPreferences";
import {
  closeCorreoThreadInHistory,
  openCorreoThreadInHistory,
} from "./correo-thread-history";
import { setCorreoComposeInHistory } from "./correo-compose-history";
import { nextThreadAfterRemove } from "./correo-list-advance";
import { useCloseOnBack } from "./useCloseOnBack";
import { isUuid } from "@/lib/utils/uuid";
import { useRegisterChatPageContext } from "@/components/opai/ChatPageContextProvider";
import { nextIntentNonce, type ComposeIntent, type ReaderOpenOpts } from "./correo-reader-intent";
import type { WorkTab } from "./work-panel-tabs";
import type { ComposerMode } from "./CorreoComposerBox";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import { buildAiMenuItems } from "./CorreoAiMenu";
import { CorreoAiMenuSheet } from "./CorreoAiMenuSheet";
import { CorreoAiStyleSheet } from "./CorreoAiStyleSheet";
import {
  CorreoAiActionPanel,
  type AiPanelCommand,
} from "./CorreoAiActionPanel";
import type { CorreoAiCommandId } from "@/modules/crm/email/correo-ai-commands";
import { getCorreoAiCommand } from "@/modules/crm/email/correo-ai-commands";
import { dispatchAiCommand } from "@/lib/ai/ai-command-event";
import { hasCapability } from "@/lib/permissions";

/** Alto visual de la isla global (8px gap + min-h-12). El safe-area lo aporta AppShell. */
const CORREOS_MOBILE_TOP_SPACER = "h-14 shrink-0 lg:hidden";

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
  useCorreoFocusScope();
  const [items, setItems] = useState<CorreoThreadDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>(null);
  const [connected, setConnected] = useState(true);
  /** Casilla Gmail activa del usuario (viene del list endpoint). */
  const [mailboxEmail, setMailboxEmail] = useState<string | null>(null);
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
  const itemsRef = useRef<CorreoThreadDTO[]>([]);
  itemsRef.current = items;
  const [folder, setFolder] = useState<CorreoFolderTab>("inbox");
  const [chip, setChip] = useState<CorreoChipKey>("todos");
  const [query, setQuery] = useState("");
  // C15: la búsqueda consulta al servidor (toda la casilla), con debounce.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [coverage, setCoverage] = useState<IndexCoverage | null>(null);
  const [semanticAvailable, setSemanticAvailable] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState(false);
  const [workTabIntent, setWorkTabIntent] = useState<{ tab: WorkTab; nonce: number } | null>(null);
  const [composeIntent, setComposeIntent] = useState<ComposeIntent | null>(null);
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // Opción C: drawer lateral móvil (carpetas + filtros + acciones).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [swipeSettingsOpen, setSwipeSettingsOpen] = useState(false);
  const [snoozeSettingsOpen, setSnoozeSettingsOpen] = useState(false);
  const [aiStyleSheetOpen, setAiStyleSheetOpen] = useState(false);
  const [shortcutsSheetOpen, setShortcutsSheetOpen] = useState(false);
  // Menú contextual (click derecho) desktop sobre una fila.
  const [ctxMenu, setCtxMenu] = useState<{ thread: CorreoThreadDTO; x: number; y: number } | null>(null);
  const [aiPanel, setAiPanel] = useState<{
    threadId: string;
    command: AiPanelCommand;
    hasAccount: boolean;
    dealId: string | null;
  } | null>(null);
  /** Bottom-sheet de Acciones IA (móvil: long-press / chip del lector). */
  const [aiMenuSheet, setAiMenuSheet] = useState<CorreoThreadDTO | null>(null);
  const perms = useEffectivePermissions();
  const canUseCopiloto = hasCapability(perms, "copiloto_correos");
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
    desktopReaderMode,
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
    undoSeconds,
    setUndoSeconds,
    snoozeConfig,
    setSnoozeConfig,
    resetPanelWidth,
    onResizePointerDown,
    onResizeKeyDown,
  } = useCorreosViewPreferences(workspaceRef);

  const fetchPage = useCallback(async (
    cur: string | null,
    reset: boolean,
    nextFolder?: CorreoFolderTab,
    opts?: { silent?: boolean; preserveItems?: boolean },
  ) => {
    // Si ya hay filas en pantalla (snapshot o carga previa), refrescar en
    // silencio: sin spinner ni opacity-70. Cambio de carpeta, búsqueda o
    // primera pintura siguen con loading visible.
    const hasRows = itemsRef.current.length > 0;
    const folderSwitch = nextFolder != null; // el effect de carpeta siempre pasa nextFolder
    const silent =
      opts?.silent ??
      (Boolean(reset) && hasRows && !debouncedQuery && !folderSwitch && !cur);
    // Tras archivar/atajos: solo reconciliar counts/meta sin reemplazar filas
    // (la UI ya es optimista). Evita el pestañeo de remount de la lista.
    const preserveItems = Boolean(opts?.preserveItems);
    if (!silent) setLoading(true);
    try {
      const f = nextFolder ?? folder;
      const qs = new URLSearchParams();
      if (cur) qs.set("cursor", cur);
      if (f !== "inbox") qs.set("folder", f);
      if (debouncedQuery) qs.set("q", debouncedQuery);
      // C18: counts (+ coverage) solo en cargas "reset" sin búsqueda activa.
      const wantCounts = reset && !cur && !debouncedQuery;
      if (wantCounts) qs.set("counts", "1");
      let r: Record<string, unknown> & {
        connected?: boolean;
        email?: string;
        canModify?: boolean;
        realtimeChannel?: unknown;
        counts?: unknown;
        coverage?: IndexCoverage | null;
        semanticAvailable?: boolean;
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
            if (!preserveItems) {
              setItems(snapshot.items);
              setCursor(null);
            }
            setOfflineSince(snapshot.savedAt);
            return;
          }
        }
        setOfflineSince(new Date().toISOString());
        return;
      }
      setConnected(r.connected !== false);
      if (typeof r.email === "string" && r.email) setMailboxEmail(r.email);
      else if (r.connected === false) setMailboxEmail(null);
      setCanModify(Boolean(r.canModify));
      setStatusReady(true);
      setRealtimeChannel(
        typeof r.realtimeChannel === "string" ? r.realtimeChannel : null,
      );
      // Sin counts en la respuesta se conservan los últimos conocidos.
      if (r.counts != null) setCounts(r.counts as Counts);
      if (r.coverage != null) setCoverage(r.coverage);
      if (typeof r.semanticAvailable === "boolean") {
        setSemanticAvailable(r.semanticAvailable);
      }
      setBackfillDone(typeof r.backfillDone === "boolean" ? r.backfillDone : null);
      setLastSyncAt(typeof r.lastSyncAt === "string" ? r.lastSyncAt : null);
      if (r.totalThreads != null) setTotalThreads(Number(r.totalThreads) || 0);
      setSyncParked(r.syncParked === true);
      setSyncParkedReason(
        typeof (r as { syncParkedReason?: unknown }).syncParkedReason === "string"
          ? ((r as { syncParkedReason?: string }).syncParkedReason ?? null)
          : null,
      );
      if (!preserveItems) {
        setItems((prev) => (reset ? r.items ?? [] : [...prev, ...(r.items ?? [])]));
        setCursor(r.nextCursor ?? null);
        // C22b: snapshot de los últimos 50 hilos del inbox para modo offline.
        if (reset && f === "inbox" && !debouncedQuery && Array.isArray(r.items)) {
          void saveInboxSnapshot(r.items);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [folder, debouncedQuery]);

  /** Refresh post-acción: counts/meta sin re-pintar la lista (anti-pestañeo). */
  const softRefresh = useCallback(() => {
    void fetchPage(null, true, undefined, { silent: true, preserveItems: true });
  }, [fetchPage]);

  /** Tras Deshacer archivar/papelera: rehidratar la lista completa. */
  const hardRefresh = useCallback(() => {
    void fetchPage(null, true);
  }, [fetchPage]);

  /** Patch local por id (acciones optimistas read/star). */
  const patchThread = useCallback((id: string, partial: Partial<CorreoThreadDTO>) => {
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...partial } : t)),
    );
  }, []);

  /** Archivar/papelera con UI optimista: soft al aplicar, hard al deshacer. */
  function runRemoveAction(
    threadId: string,
    action: "archive" | "trash",
    okMsg: string,
  ) {
    const undo = action === "archive" ? "unarchive" : "untrash";
    void runCorreoAction(threadId, action, okMsg, softRefresh, undo, hardRefresh);
  }

  // Pintura instantánea: snapshot IndexedDB antes de que llegue la red.
  useEffect(() => {
    let cancelled = false;
    void loadInboxSnapshot().then((snap) => {
      if (cancelled || !snap?.items?.length) return;
      setItems((prev) => (prev.length === 0 ? snap.items : prev));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    // Deep-link del command palette / productividad: abrir el composer.
    // La URL se mantiene en sync con open/close vía setCorreoComposeInHistory
    // — cerrar o descartar quita ?compose=1 para que un refresh no lo reabra.
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
    // Siempre pasa `folder` como nextFolder → loading visible al cambiar carpeta.
    void fetchPage(null, true, folder);
  }, [fetchPage, folder]);

  // Al entrar a la bandeja (o volver tras >60s), disparamos un check delta en
  // background — mismo mecanismo liviano que usa el push (solo history/labels,
  // sin sweep ni self-heal) — para que "abrir Correos" siempre busque correo
  // nuevo, sin esperar al próximo cron. No bloquea el primer render (la lista
  // ya se pobló desde el espejo local) ni muestra toasts; si trae algo nuevo,
  // el mismo broadcast de siempre (`mailbox-changed`) actualiza la lista sola.
  useEffect(() => {
    if (!statusReady || !connected) return;
    const STORAGE_KEY = "correos:lastOpenSyncAt";
    const last = Number(window.sessionStorage.getItem(STORAGE_KEY) ?? 0);
    if (Date.now() - last < 60_000) return;
    window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
    void fetch("/api/crm/gmail/sync?background=1", { method: "POST" }).catch(() => {});
  }, [statusReady, connected]);

  const lastRefreshAtRef = useRef(0);
  /** Lista + detalle del hilo abierto (incrementa refreshToken del drawer). */
  const refreshOpenThread = useCallback(() => {
    setRealtimeRevision((value) => value + 1);
    void fetchPage(null, true);
  }, [fetchPage]);
  const refreshMailbox = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      lastRefreshAtRef.current = Date.now();
      refreshOpenThread();
    }, 150);
  }, [refreshOpenThread]);
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

  const syncNow = useCallback(async () => {
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
  }, [fetchPage]);

  /** Remoción optimista tras archivar/eliminar; los counts se corrigen al revalidar. */
  function removeThreadLocally(id: string) {
    setItems((prev) => prev.filter((t) => t.id !== id));
    setCounts((c) =>
      c ? { ...c, inbox: Math.max(0, c.inbox - 1), all: Math.max(0, c.all - 1) } : c,
    );
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // La búsqueda ya viene filtrada del servidor; los chips siguen siendo
  // client-side (filtran metadata de asociación ya presente en la página).
  const filtered = items.filter((t) => matchesChip(t, chip));
  const searching = debouncedQuery.length > 0;
  const filteredFocusKey = useMemo(() => {
    if (filtered.length === 0) return "empty";
    return `${filtered.length}:${filtered[0]?.id}:${filtered[filtered.length - 1]?.id}`;
  }, [filtered]);

  // OPAI Intelligence: inyecta el hilo abierto como page context (threadId
  // implícito para tools get_email_thread / create_lead_from_email / etc.).
  const openThreadPreview = openId
    ? items.find((t) => t.id === openId) ?? null
    : null;
  useRegisterChatPageContext(
    openThreadPreview
      ? {
          entityType: "crm_email_thread",
          entityId: openThreadPreview.id,
          entityName: openThreadPreview.subject?.trim() || "(sin asunto)",
          entityUrl: `/crm/correos?thread=${openThreadPreview.id}`,
          extra: [
            openThreadPreview.fromEmail
              ? `Header From (puede ser una casilla propia y traer el nombre del cliente delante): ${openThreadPreview.fromEmail}`
              : null,
            "La contraparte real se resuelve en servidor; no asumas que este header es el email del cliente.",
            openThreadPreview.accountId
              ? `Cuenta: ${openThreadPreview.accountName ?? openThreadPreview.accountId}`
              : "Sin cuenta asociada",
            openThreadPreview.dealId
              ? `Deal: ${openThreadPreview.dealTitle ?? openThreadPreview.dealId}`
              : null,
            openThreadPreview.leadId ? `Lead: ${openThreadPreview.leadId}` : null,
            `Adjuntos: ${openThreadPreview.attachmentCount}`,
            openThreadPreview.snippet
              ? `Snippet: ${openThreadPreview.snippet.slice(0, 180)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
  );

  // Ticket operativo desde el panel IA → abre el panel de trabajo.
  useEffect(() => {
    function onOpenWork(ev: Event) {
      const detail = (ev as CustomEvent<{ threadId: string; tab?: WorkTab }>).detail;
      if (!detail?.threadId) return;
      openThread(detail.threadId, { workTab: detail.tab ?? "productividad" });
    }
    window.addEventListener("opai-correo-open-work", onOpenWork);
    return () => window.removeEventListener("opai-correo-open-work", onOpenWork);
    // openThread es estable en la práctica (cierra sobre setters); se re-liga al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Archivar / papelera / snooze: saca el hilo. En desktop (split) avanza al
   * siguiente como Gmail. En móvil vuelve a la bandeja — quedarse en el
   * siguiente hilo se sentía como “no vuelve a inicio” tras posponer.
   */
  function removeThreadAndAdvance(id: string) {
    const list = itemsRef.current.filter((t) => matchesChip(t, chip));
    const { nextId, nextFocusIndex } = nextThreadAfterRemove(list, id);
    const readerWasOnRemoved = openId === id;
    const focusedId = focusIndex >= 0 ? list[focusIndex]?.id : undefined;
    const readerOpen = openId !== null;
    removeThreadLocally(id);
    if (nextFocusIndex >= 0) setFocusIndex(nextFocusIndex);
    else setFocusIndex(-1);
    if (readerWasOnRemoved || (readerOpen && focusedId === id)) {
      // Móvil: cerrar lector de inmediato (lista = pantalla de inicio).
      if (isCoarse && readerWasOnRemoved) {
        setOpenId(null);
        setAutoExtract(false);
        setWorkTabIntent(null);
        setComposeIntent(null);
        closeCorreoThreadInHistory();
        return;
      }
      if (nextId) {
        openCorreoThreadInHistory(nextId, true);
        setOpenId(nextId);
        setAutoExtract(false);
        // Lectura optimista en lista (evita refetch al marcar leído).
        setItems((prev) =>
          prev.map((t) => (t.id === nextId && t.isUnread ? { ...t, isUnread: false } : t)),
        );
      } else {
        setOpenId(null);
        setAutoExtract(false);
        closeCorreoThreadInHistory();
      }
    }
  }

  function openThread(id: string, opts?: ReaderOpenOpts) {
    openCorreoThreadInHistory(id, openId !== null);
    setOpenId(id);
    setAutoExtract(opts?.extract === true);
    setWorkTabIntent(
      opts?.workTab ? { tab: opts.workTab, nonce: nextIntentNonce() } : null,
    );
    setComposeIntent(
      opts?.compose
        ? { mode: opts.compose.mode, ai: opts.compose.ai, nonce: nextIntentNonce() }
        : null,
    );
    setItems((prev) =>
      prev.map((t) => (t.id === id && t.isUnread ? { ...t, isUnread: false } : t)),
    );
    const idx = filtered.findIndex((t) => t.id === id);
    if (idx >= 0) setFocusIndex(idx);
  }

  function openCompose(id: string, mode: ComposerMode, ai = false) {
    // Si el hilo ya está abierto, solo pedí el composer — no re-montar el
    // lector ni limpiar workTab/autoExtract (atajos R/A/F del lector).
    if (openId === id) {
      setComposeIntent({ mode, ai, nonce: nextIntentNonce() });
      return;
    }
    openThread(id, { compose: { mode, ai } });
  }

  function openWork(id: string, tab: WorkTab) {
    openThread(id, { workTab: tab });
  }

  function closeThread() {
    // UI primero: antes solo limpiábamos estado si replaceState (deep-link).
    // Con pushState el cierre hacía history.back() y esperaba popstate → el
    // lector quedaba montado un frame (o más) y se sentía “pegajoso” en móvil.
    setOpenId(null);
    setAutoExtract(false);
    setWorkTabIntent(null);
    setComposeIntent(null);
    closeCorreoThreadInHistory();
  }

  // ── C12: selección múltiple + acciones masivas ──
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);
  // v2: modo selección móvil (long-press / tap en avatar). Deriva del estado
  // existente — no hay un segundo estado de selección.
  const selectionMode = selectedIds.size > 0;
  // Gesto/botón atrás en móvil limpia la selección antes de salir de la vista
  // (misma pila LIFO que usa el lector). En desktop no se toca el historial.
  useCloseOnBack(isCoarse && selectionMode, clearSelection);

  // Isla global: menú de carpetas, búsqueda del módulo y supresión en selección.
  useSetIslandModuleMenu({
    icon: Menu,
    label: "Carpetas y filtros",
    badge: counts?.inboxUnread ?? 0,
    onOpen: () => setMobileNavOpen(true),
  });
  useSetIslandSearch({
    placeholder: "Buscá lo que recordás",
    value: query,
    onChange: setQuery,
    onExit: () => {
      setQuery("");
      setDebouncedQuery("");
    },
  });
  useSetIslandSuppressed(selectionMode);
  function bulkAction(
    action: CorreoAction,
    okMsg: string,
    opts?: { undo?: CorreoAction; removes?: boolean },
  ) {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0) return;
    if (opts?.removes) {
      const wasOpen = openId !== null && selectedIds.has(openId);
      const remaining = filtered.filter((t) => !selectedIds.has(t.id));
      const nextId = wasOpen ? (remaining[0]?.id ?? null) : null;
      setItems((prev) => prev.filter((t) => !selectedIds.has(t.id)));
      setCounts((c) =>
        c
          ? {
              ...c,
              inbox: Math.max(0, c.inbox - threadIds.length),
              all: Math.max(0, c.all - threadIds.length),
            }
          : c,
      );
      if (wasOpen) {
        if (nextId && !isCoarse) {
          openCorreoThreadInHistory(nextId, true);
          setOpenId(nextId);
          setAutoExtract(false);
          const nextIdx = remaining.findIndex((t) => t.id === nextId);
          setFocusIndex(nextIdx >= 0 ? nextIdx : -1);
        } else {
          setOpenId(null);
          setAutoExtract(false);
          setFocusIndex(-1);
          setWorkTabIntent(null);
          setComposeIntent(null);
          closeCorreoThreadInHistory();
        }
      }
    }
    clearSelection();
    runBulkCorreoAction({
      threadIds,
      action,
      okMsg,
      undo: opts?.undo,
      onDone: softRefresh,
    });
  }

  // ── C20: navegación y acciones por teclado sobre la fila enfocada ──
  const focusedThread = focusIndex >= 0 ? filtered[focusIndex] : undefined;

  // No auto-marcar la fila 0 al entrar: sin j/k ni hilo abierto, focusIndex
  // queda en -1 (ninguna fila verde). Solo clamp si el índice quedó fuera.
  useEffect(() => {
    if (filtered.length === 0) {
      setFocusIndex(-1);
      return;
    }
    setFocusIndex((prev) => {
      if (prev < 0) return prev;
      if (prev >= filtered.length) return filtered.length - 1;
      return prev;
    });
  }, [filteredFocusKey, filtered.length]);

  // Con el lector abierto, la fila enfocada = hilo abierto (una sola marca).
  useEffect(() => {
    if (!openId || filtered.length === 0) return;
    const idx = filtered.findIndex((t) => t.id === openId);
    if (idx >= 0) setFocusIndex((prev) => (prev === idx ? prev : idx));
    // filtered se re-deriva; filteredFocusKey cubre cambios de lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filteredFocusKey
  }, [openId, filteredFocusKey]);

  /** Hilo objetivo de atajos: fila enfocada, hilo abierto, o la primera visible. */
  function resolveThread() {
    if (focusedThread) return focusedThread;
    if (openId) {
      const open = filtered.find((t) => t.id === openId);
      if (open) return open;
    }
    if (filtered.length === 0) return undefined;
    // Primera acción de teclado sin foco: apunta a la fila 0 sin abrirla.
    setFocusIndex(0);
    return filtered[0];
  }

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
    replyHandledExternally: openId !== null,
    shortcuts,
    onHelp: () => setShortcutsSheetOpen(true),
    onStar: () => {
      const t = resolveThread();
      if (!t) return;
      const starred = Boolean(t.starredAt);
      void runCorreoAction(
        t.id,
        starred ? "unstar" : "star",
        starred ? "Quitado de Destacados" : "Destacado",
        () => void fetchPage(null, true),
        starred ? "star" : "unstar",
      );
    },
    onDown: () => moveFocus(1),
    onUp: () => moveFocus(-1),
    onOpen: () => {
      const t = resolveThread();
      if (t) openThread(t.id);
    },
    onToggleSelect: () => {
      const t = resolveThread();
      if (t) toggleSelect(t.id);
    },
    onArchive: () => {
      if (selectedIds.size > 0) {
        bulkAction("archive", "Archivados", { undo: "unarchive", removes: true });
        return;
      }
      const t = resolveThread();
      if (!t) return;
      removeThreadAndAdvance(t.id);
      runRemoveAction(t.id, "archive", "Archivado");
    },
    onReply: () => {
      const t = resolveThread();
      if (t) openCompose(t.id, "reply", true);
    },
    onReplyAll: () => {
      const t = resolveThread();
      if (t) openCompose(t.id, "all", true);
    },
    onForward: () => {
      const t = resolveThread();
      if (t) openCompose(t.id, "forward", false);
    },
    onTrash: () => {
      if (selectedIds.size > 0) {
        bulkAction("trash", "Movidos a la Papelera", { undo: "untrash", removes: true });
        return;
      }
      const t = resolveThread();
      if (!t) return;
      removeThreadAndAdvance(t.id);
      runRemoveAction(t.id, "trash", "Movido a la Papelera");
    },
    onSnooze: () => {
      if (selectedIds.size > 0) setSnoozeId("__bulk__");
      else {
        const t = resolveThread();
        if (t) setSnoozeId(t.id);
      }
    },
    onToggleRead: () => {
      const t = resolveThread();
      if (!t) return;
      const wasUnread = t.isUnread;
      void runCorreoAction(
        t.id,
        wasUnread ? "markRead" : "markUnread",
        wasUnread ? "Marcado como leído" : "Marcado como no leído",
        () => void fetchPage(null, true),
        wasUnread ? "markUnread" : "markRead",
      );
    },
    onFocusSearch: focusCorreosSearch,
    onAiMenu: () => {
      const t = resolveThread();
      if (!t) return;
      const row = document.querySelector(`[data-correo-row="${t.id}"]`);
      const rect = row?.getBoundingClientRect();
      openAiMenuForThread(t, {
        x: rect ? rect.right - 40 : 80,
        y: rect ? rect.bottom : 120,
      });
    },
  });

  function openAiPanel(t: CorreoThreadDTO, command: AiPanelCommand) {
    setAiPanel({
      threadId: t.id,
      command,
      hasAccount: Boolean(t.accountId),
      dealId: t.dealId,
    });
  }

  function handleAiCommand(commandId: CorreoAiCommandId, t: CorreoThreadDTO) {
    const cmd = getCorreoAiCommand(commandId);
    if (cmd.kind === "chat") {
      // Asegurar page context del hilo antes de abrir el chat.
      openThread(t.id);
      // Diferir el evento un frame para que useRegisterChatPageContext corra.
      window.setTimeout(() => {
        dispatchAiCommand({ prompt: cmd.prompt ?? cmd.label, autoSend: true });
      }, 0);
      return;
    }
    if (
      commandId === "analizar" ||
      commandId === "crm_completo" ||
      commandId === "lead" ||
      commandId === "ticket_operativo" ||
      commandId === "candidato" ||
      commandId === "cobranza"
    ) {
      openAiPanel(t, commandId);
    }
  }

  function openAiMenuForThread(t: CorreoThreadDTO, anchor: { x: number; y: number }) {
    const aiItems = buildAiMenuItems(t, perms, { onCommand: handleAiCommand });
    if (aiItems.length === 0) return;
    if (isCoarse) {
      setAiMenuSheet(t);
      return;
    }
    setCtxMenu({ thread: t, x: anchor.x, y: anchor.y });
  }

  // Callbacks estables por id — evitan re-render de todas las filas en cada paint.
  const handleRowOpen = useCallback(
    (id: string) => {
      if (selectionMode && isCoarse) toggleSelect(id);
      else openThread(id);
    },
    // openThread cierra sobre setters + filtered; selectionMode/isCoarse bastan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectionMode, isCoarse, toggleSelect, openId, filtered],
  );
  const handleRowLongPress = useCallback(
    (id: string) => {
      const t = itemsRef.current.find((x) => x.id === id);
      if (!t) return;
      if (selectionMode) {
        if (canModify) toggleSelect(id);
        return;
      }
      const aiItems = buildAiMenuItems(t, perms, { onCommand: handleAiCommand });
      if (aiItems.length > 0) {
        setAiMenuSheet(t);
        return;
      }
      if (canModify) toggleSelect(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectionMode, canModify, toggleSelect, perms],
  );
  const handleRowAiMenu = useCallback(
    (id: string, anchor: { x: number; y: number }) => {
      const t = itemsRef.current.find((x) => x.id === id);
      if (t) openAiMenuForThread(t, anchor);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isCoarse, perms],
  );
  const handleRowSnooze = useCallback((id: string) => {
    setSnoozeId(id);
  }, []);

  function openAiMenuSheetForThread(t: CorreoThreadDTO) {
    const aiItems = buildAiMenuItems(t, perms, { onCommand: handleAiCommand });
    if (aiItems.length === 0) return;
    setAiMenuSheet(t);
  }

  // Ítems del menú contextual (click derecho, desktop): 3 bloques + 3 submenús.
  function contextItems(
    t: CorreoThreadDTO,
    _anchor?: { x: number; y: number },
  ): CorreoMenuItem[] {
    const aiItems = buildAiMenuItems(t, perms, { onCommand: handleAiCommand });
    const items: CorreoMenuItem[] = [
      {
        icon: <Reply className="h-4 w-4" />,
        label: "Responder",
        onClick: () => openCompose(t.id, "reply", true),
      },
      {
        icon: <ReplyAll className="h-4 w-4" />,
        label: "Responder a todos",
        onClick: () => openCompose(t.id, "all", true),
      },
      {
        icon: <Forward className="h-4 w-4" />,
        label: "Reenviar",
        onClick: () => openCompose(t.id, "forward"),
      },
    ];

    if (canModify) {
      const unread = t.isUnread;
      const starred = Boolean(t.starredAt);
      items.push(
        {
          divider: true,
          icon: <Archive className="h-4 w-4" />,
          label: "Archivar",
          onClick: () => {
            removeThreadAndAdvance(t.id);
            runRemoveAction(t.id, "archive", "Archivado");
          },
        },
        {
          icon: <Trash2 className="h-4 w-4" />,
          label: "Eliminar",
          danger: true,
          onClick: () => {
            removeThreadAndAdvance(t.id);
            runRemoveAction(t.id, "trash", "Movido a la Papelera");
          },
        },
        {
          icon: <Clock className="h-4 w-4" />,
          label: "Posponer",
          onClick: () => setSnoozeId(t.id),
        },
        {
          icon: unread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />,
          label: unread ? "Marcar leído" : "Marcar no leído",
          onClick: () =>
            void runCorreoAction(
              t.id,
              unread ? "markRead" : "markUnread",
              unread ? "Marcado como leído" : "Marcado como no leído",
              () => void fetchPage(null, true),
              unread ? "markUnread" : "markRead",
            ),
        },
        {
          icon: <Star className="h-4 w-4" />,
          label: starred ? "Quitar destacado" : "Destacar",
          onClick: () =>
            void runCorreoAction(
              t.id,
              starred ? "unstar" : "star",
              starred ? "Quitado de Destacados" : "Destacado",
              () => void fetchPage(null, true),
              starred ? "star" : "unstar",
            ),
        },
      );
    }

    if (aiItems.length > 0) {
      items.push({
        divider: true,
        icon: <Sparkles className="h-4 w-4" />,
        label: "✦ Copiloto",
        onClick: () => {},
        submenu: [...aiItems],
      });
    }

    items.push(
      {
        divider: true,
        icon: <ListTodo className="h-4 w-4" />,
        label: "Trabajo",
        onClick: () => {},
        submenu: [
          {
            icon: <CalendarPlus className="h-4 w-4" />,
            label: "Agendar reunión",
            onClick: () => openWork(t.id, "productividad"),
          },
          {
            icon: <ListTodo className="h-4 w-4" />,
            label: "Crear tarea",
            onClick: () => openWork(t.id, "productividad"),
          },
          {
            icon: <TicketPlus className="h-4 w-4" />,
            label: "Crear ticket",
            onClick: () => openWork(t.id, "productividad"),
          },
          {
            divider: true,
            icon: <CheckSquare className="h-4 w-4" />,
            label: "Panel de trabajo",
            onClick: () => openWork(t.id, "resumen"),
          },
        ],
      },
      {
        icon: <Building2 className="h-4 w-4" />,
        label: "CRM",
        onClick: () => {},
        submenu: [
          {
            icon: <Building2 className="h-4 w-4" />,
            label: "Asociar cuenta",
            onClick: () => openWork(t.id, "cuenta"),
          },
          {
            icon: <Link2 className="h-4 w-4" />,
            label: "Vincular instalación/factura",
            onClick: () => openWork(t.id, "vinculos"),
          },
          // Sin Copiloto: conserva el acceso previo a lead con IA.
          ...(aiItems.length === 0
            ? [
                {
                  icon: <Sparkles className="h-4 w-4" />,
                  label: "Crear lead con IA",
                  onClick: () => openAiPanel(t, "lead"),
                } satisfies CorreoMenuItem,
              ]
            : []),
        ],
      },
    );

    return items;
  }

  return (
    <>
      {/* Con selección, la isla se suprime (useSetIslandSuppressed) y esta
          barra ocupa el mismo slot fijo. */}
      {selectionMode && (
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
      )}
      {/* Reserva el alto de la isla / barra de selección. */}
      <div aria-hidden className={CORREOS_MOBILE_TOP_SPACER} />
      <div className="space-y-1 px-4 lg:hidden">
        {query.trim().length > 0 && <CorreoSearchChips query={query} onQuery={setQuery} />}
        <CorreoIndexCoverageBar
          coverage={coverage}
          compact
          syncing={syncing}
          onIndexed={setCoverage}
        />
      </div>
      <CorreosMobileDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        folder={folder}
        onFolder={setFolder}
        chip={chip}
        onChip={setChip}
        counts={counts}
        previewLines={previewLines}
        onPreviewLines={setPreviewLines}
        onSync={syncNow}
        syncing={syncing}
        realtimeStatus={realtimeStatus}
        lastSyncAt={lastSyncAt}
        mailboxEmail={mailboxEmail}
        onOpenSwipeSettings={() => setSwipeSettingsOpen(true)}
        onOpenSnoozeSettings={() => setSnoozeSettingsOpen(true)}
        onOpenAiStyle={() => setAiStyleSheetOpen(true)}
        onOpenShortcuts={() => setShortcutsSheetOpen(true)}
        onInsertSearch={(token) => {
          setQuery((prev) => (prev.trim() ? `${prev.trim()} ${token}` : token));
        }}
      />
      <CorreoSwipeSettingsSheet
        open={swipeSettingsOpen}
        onClose={() => setSwipeSettingsOpen(false)}
        config={swipeConfig}
        onConfig={setSwipeConfig}
        undoSeconds={undoSeconds}
        onUndoSeconds={setUndoSeconds}
      />
      <CorreoSnoozeSettingsSheet
        open={snoozeSettingsOpen}
        onClose={() => setSnoozeSettingsOpen(false)}
        config={snoozeConfig}
        onConfig={setSnoozeConfig}
      />
      <CorreoAiStyleSheet
        open={aiStyleSheetOpen}
        onClose={() => setAiStyleSheetOpen(false)}
      />
      <CorreoShortcutsSheet
        open={shortcutsSheetOpen}
        onClose={() => setShortcutsSheetOpen(false)}
        config={shortcuts}
        onConfig={setShortcuts}
      />
      <CorreoContextMenu
        anchor={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null}
        items={
          ctxMenu
            ? contextItems(ctxMenu.thread, { x: ctxMenu.x, y: ctxMenu.y })
            : []
        }
        onClose={() => setCtxMenu(null)}
      />
      <CorreoAiMenuSheet
        open={aiMenuSheet !== null}
        items={
          aiMenuSheet
            ? buildAiMenuItems(aiMenuSheet, perms, { onCommand: handleAiCommand })
            : []
        }
        onClose={() => setAiMenuSheet(null)}
      />
      {aiPanel && (
        <CorreoAiActionPanel
          open
          threadId={aiPanel.threadId}
          command={aiPanel.command}
          hasAccount={aiPanel.hasAccount}
          existingDealId={aiPanel.dealId}
          onClose={() => setAiPanel(null)}
          onCreated={refreshOpenThread}
        />
      )}
    <CorreosPullToRefresh
      onRefresh={syncNow}
      disabled={syncing || !connected}
      className="ds-page-enter space-y-5 max-lg:pb-28 lg:space-y-3"
    >
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
          onClick={() => {
            setComposeOpen(true);
            setCorreoComposeInHistory(true);
          }}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground shadow-lg ds-tap lg:hidden"
        >
          <PenLine className="h-4 w-4" /> Redactar
        </button>
      )}

      <div
        ref={workspaceRef}
        data-correo-scope
        className="relative min-w-0 lg:flex lg:items-start lg:gap-3"
      >
        {/* Riel desktop contraíble (Gmail): carpetas + filtros + sync. */}
        <CorreosDesktopRail
          folder={folder} onFolder={setFolder}
          chip={chip} onChip={setChip}
          counts={counts}
          onCompose={() => {
            setComposeOpen(true);
            setCorreoComposeInHistory(true);
          }}
          onSync={syncNow} syncing={syncing}
          realtimeStatus={realtimeStatus} lastSyncAt={lastSyncAt}
          mailboxEmail={mailboxEmail}
          collapsed={railCollapsed}
          onToggleCollapsed={() => setRailCollapsed(!railCollapsed)}
          onOpenSwipeSettings={() => setSwipeSettingsOpen(true)}
          onOpenSnoozeSettings={() => setSnoozeSettingsOpen(true)}
          onOpenAiStyle={() => setAiStyleSheetOpen(true)}
          onOpenShortcuts={() => setShortcutsSheetOpen(true)}
        />
        <div className="min-w-0 flex-1 space-y-4 max-lg:px-4 lg:min-w-[340px] lg:space-y-3">
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
            onOpenShortcuts={() => setShortcutsSheetOpen(true)}
          />
          <div className="hidden space-y-2 lg:block">
            {query.trim().length > 0 && <CorreoSearchChips query={query} onQuery={setQuery} />}
            <CorreoIndexCoverageBar
              coverage={coverage}
              syncing={syncing}
              onIndexed={setCoverage}
            />
            {searching && !semanticAvailable && (
              <p className="text-[12px] text-status-warn-fg">
                Búsqueda por significado no disponible ahora; mostrando coincidencias de texto exacto.
              </p>
            )}
          </div>
          {!connected ? (
            <EmptyState icon={Mail} title="Conectá tu Gmail" description="Conectá tu casilla en Integraciones." />
          ) : folder === "scheduled" ? (
            /* PR-12: Programados se alimenta del outbox, no de hilos. */
            <CorreoScheduledList refreshToken={realtimeRevision} />
          ) : loading && items.length === 0 ? (
            <Spinner className="mx-auto" />
          ) : filtered.length === 0 ? (
            searching ? (
              <EmptyState
                icon={Mail}
                title="Sin resultados"
                description={
                  coverage && coverage.pct < 100
                    ? `No encontramos coincidencias por texto ni por significado en esta carpeta. La casilla tiene ${coverage.pct}% indexado: correos antiguos pueden no aparecer por significado. Probá from:, is:unread o reformulá.`
                    : !semanticAvailable
                      ? "Nada coincide por texto exacto. La búsqueda por significado no está disponible ahora."
                      : "Nada coincide por texto exacto ni por significado en esta carpeta. Probá from:, subject:, is:unread o has:attachment."
                }
              />
            ) : (
              <EmptyState icon={Mail} title="Sin correos" description="Probá sincronizar o cambiá los filtros." />
            )
          ) : (
            <Surface
              elevation={1}
              padding="none"
              className="relative overflow-hidden max-lg:-mx-4 max-lg:rounded-none max-lg:border-x-0"
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
                <CorreoRowSwipe
                  key={t.id}
                  thread={t}
                  canModify={canModify}
                  selected={openId === t.id}
                  focused={focusIndex === index}
                  checked={selectedIds.has(t.id)}
                  onToggleCheck={canModify ? toggleSelect : undefined}
                  onAvatarPress={canModify ? toggleSelect : undefined}
                  onLongPress={handleRowLongPress}
                  selectionMode={selectionMode}
                  previewLines={previewLines}
                  swipeConfig={swipeConfig}
                  onChanged={softRefresh}
                  onPatch={patchThread}
                  onRemoveDone={softRefresh}
                  onUndoDone={hardRefresh}
                  onRemove={removeThreadAndAdvance}
                  onSnooze={handleRowSnooze}
                  onAiMenu={canUseCopiloto ? handleRowAiMenu : undefined}
                  onOpen={handleRowOpen}
                />
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

        <CorreoDrawer
          threadId={openId}
          preview={openId ? items.find((t) => t.id === openId) ?? null : null}
          mailboxEmail={mailboxEmail}
          shortcuts={shortcuts}
          autoExtract={autoExtract}
          workTabIntent={workTabIntent}
          composeIntent={composeIntent}
          canModify={canModify}
          refreshToken={realtimeRevision}
          desktopWidth={panelWidth}
          onResizePointerDown={onResizePointerDown}
          onResizeKeyDown={onResizeKeyDown}
          onResizeReset={resetPanelWidth}
          desktopMode={desktopReaderMode}
          manageBackHistory={false}
          alwaysShowImages={alwaysShowImages}
          onAlwaysShowImages={() => setAlwaysShowImages(true)}
          snoozeConfig={snoozeConfig}
          onOpenSnoozeSettings={() => setSnoozeSettingsOpen(true)}
          onClose={closeThread}
          onRemove={removeThreadAndAdvance}
          onRemoveDone={softRefresh}
          onUndoDone={hardRefresh}
          onChanged={hardRefresh}
          onOpenAiLead={() => {
            const t = openId ? items.find((x) => x.id === openId) : null;
            if (t) openAiPanel(t, "lead");
          }}
          onAiCommand={(commandId) => {
            const t = openId ? items.find((x) => x.id === openId) : null;
            if (t) handleAiCommand(commandId, t);
          }}
          onOpenAiMenu={
            canUseCopiloto
              ? () => {
                  const t = openId ? items.find((x) => x.id === openId) : null;
                  if (!t) return;
                  openAiMenuSheetForThread(t);
                }
              : undefined
          }
          onOpenAiStyle={() => setAiStyleSheetOpen(true)}
        />
      </div>

    </CorreosPullToRefresh>
      {/* Fuera del root animado: modales que no deben heredar el transform
          de ds-page-enter (FAB de compose, posponer masivo, etc.). */}
      <CorreoComposeSheet
        open={composeOpen}
        onClose={() => {
          setComposeOpen(false);
          setCorreoComposeInHistory(false);
        }}
        onSent={() => void fetchPage(null, true)}
      />

      <CorreoSnoozeSheet
        open={snoozeId !== null}
        onClose={() => setSnoozeId(null)}
        config={snoozeConfig}
        onOpenSettings={() => setSnoozeSettingsOpen(true)}
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
          removeThreadAndAdvance(id);
          void snoozeThread(id, iso, `Pospuesto hasta ${label}`, softRefresh);
        }}
      />
    </>
  );
}
