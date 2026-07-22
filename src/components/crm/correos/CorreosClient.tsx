"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
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

function matchesQuery(t: CorreoThreadDTO, q: string): boolean {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return [t.subject, t.fromEmail, t.snippet, t.accountName].some((v) =>
    v?.toLowerCase().includes(term),
  );
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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [folder, setFolder] = useState<CorreoFolderTab>("inbox");
  const [chip, setChip] = useState<CorreoChipKey>("todos");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState(false);
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
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
      const r = await fetch(`/api/crm/correos?${qs}`).then((x) => x.json());
      setConnected(r.connected !== false);
      setCanModify(Boolean(r.canModify));
      setRealtimeChannel(
        typeof r.realtimeChannel === "string" ? r.realtimeChannel : null,
      );
      setCounts(r.counts ?? null);
      setBackfillDone(typeof r.backfillDone === "boolean" ? r.backfillDone : null);
      setLastSyncAt(typeof r.lastSyncAt === "string" ? r.lastSyncAt : null);
      setTotalThreads(Number(r.totalThreads) || 0);
      setItems((prev) => (reset ? r.items ?? [] : [...prev, ...(r.items ?? [])]));
      setCursor(r.nextCursor ?? null);
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const syncThreadFromUrl = () => {
      const current = new URLSearchParams(window.location.search);
      setOpenId(current.get("thread"));
      setAutoExtract(current.get("extract") === "1");
    };
    syncThreadFromUrl();
    // Deep-links: "archived" ya no es pestaña → normalizar a "Todos".
    const f = sp.get("folder");
    if (f === "archived") setFolder("all");
    else if (f === "all" || f === "trash" || f === "inbox" || f === "snoozed") setFolder(f);
    window.addEventListener("popstate", syncThreadFromUrl);
    return () => window.removeEventListener("popstate", syncThreadFromUrl);
  }, []);

  useEffect(() => {
    void fetchPage(null, true, folder);
  }, [fetchPage, folder]);

  const refreshMailbox = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      setRealtimeRevision((value) => value + 1);
      void fetchPage(null, true);
    }, 150);
  }, [fetchPage]);
  const realtimeStatus = useCorreosRealtime(
    realtimeChannel,
    refreshMailbox,
  );

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") refreshMailbox();
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

  const filtered = items.filter((t) => matchesChip(t, chip) && matchesQuery(t, query));

  return (
    <div className="ds-page-enter space-y-5">
      {/* El encabezado se desplaza con el scroll: recupera pantalla en móvil
          (antes todo el hero quedaba fijo y solo scrolleaba la lista). */}
      <div className="space-y-5">
        <PageHero icon={Mail} iconTone="violet" title="Correos" subtitle="Bandeja comercial"
          description="Hilos de tu Gmail vinculados a cuentas, negocios y leads" />

        <CorreosSyncBanner backfillDone={backfillDone} totalThreads={totalThreads}
          onConnected={() => void fetchPage(null, true)} />

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
          counts={counts} query={query} onQuery={setQuery} onSync={syncNow} syncing={syncing}
          realtimeStatus={realtimeStatus} previewLines={previewLines}
          onPreviewLines={setPreviewLines} lastSyncAt={lastSyncAt} />
      </div>

      <div
        ref={workspaceRef}
        className="relative min-w-0 lg:flex lg:items-start lg:gap-4"
      >
        <div className="min-w-0 flex-1 space-y-4">
          {!connected ? (
            <EmptyState icon={Mail} title="Conectá tu Gmail" description="Conectá tu casilla en Integraciones." />
          ) : loading && items.length === 0 ? (
            <Spinner className="mx-auto" />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Mail} title="Sin correos" description="Probá sincronizar o cambiá los filtros." />
          ) : (
            <Surface elevation={1} padding="none" className="overflow-hidden">
              {filtered.map((t) => (
                <CorreoRowSwipe key={t.id} thread={t} canModify={canModify}
                  selected={openId === t.id}
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

      <CorreoSnoozeSheet
        open={snoozeId !== null}
        onClose={() => setSnoozeId(null)}
        onConfirm={(iso, label) => {
          const id = snoozeId;
          if (!id) return;
          removeThreadLocally(id);
          void snoozeThread(id, iso, `Pospuesto hasta ${label}`, () => void fetchPage(null, true));
        }}
      />
    </div>
  );
}
