"use client";

import { useEffect, useState } from "react";
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

  async function fetchPage(cur: string | null, reset: boolean, nextFolder?: CorreoFolderTab) {
    setLoading(true);
    try {
      const f = nextFolder ?? folder;
      const qs = new URLSearchParams();
      if (cur) qs.set("cursor", cur);
      if (f !== "inbox") qs.set("folder", f);
      const r = await fetch(`/api/crm/correos?${qs}`).then((x) => x.json());
      setConnected(r.connected !== false);
      setCanModify(Boolean(r.canModify));
      setCounts(r.counts ?? null);
      setBackfillDone(typeof r.backfillDone === "boolean" ? r.backfillDone : null);
      setTotalThreads(Number(r.totalThreads) || 0);
      setItems((prev) => (reset ? r.items ?? [] : [...prev, ...(r.items ?? [])]));
      setCursor(r.nextCursor ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("thread");
    if (t) {
      setOpenId(t);
      setAutoExtract(sp.get("extract") === "1");
    }
    // Deep-links: "archived" ya no es pestaña → normalizar a "Todos".
    const f = sp.get("folder");
    if (f === "archived") setFolder("all");
    else if (f === "all" || f === "trash" || f === "inbox" || f === "snoozed") setFolder(f);
  }, []);

  useEffect(() => {
    void fetchPage(null, true, folder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await fetch("/api/crm/gmail/sync", { method: "POST" }).then((x) => x.json());
      if (!r.success) {
        toast.error(r.error || "No se pudo sincronizar");
      } else {
        const neu = Number(r.syncedCount) || 0;
        const upd = Math.max((Number(r.fetched) || 0) - neu, 0);
        toast.success(`${neu} hilos nuevos · ${upd} actualizados`);
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

  const filtered = items.filter((t) => matchesChip(t, chip) && matchesQuery(t, query));

  return (
    <div className="ds-page-enter space-y-5">
      <PageHero icon={Mail} iconTone="primary" title="Correos" subtitle="Bandeja comercial"
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

      <CorreosFilters folder={folder} onFolder={setFolder} chip={chip} onChip={setChip}
        counts={counts} query={query} onQuery={setQuery} onSync={syncNow} syncing={syncing} />

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
              onChanged={() => void fetchPage(null, true)}
              onRemove={removeThreadLocally}
              onSnooze={() => setSnoozeId(t.id)}
              onOpen={() => { setOpenId(t.id); setAutoExtract(false); }} />
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

      <CorreoDrawer threadId={openId} autoExtract={autoExtract} canModify={canModify}
        onClose={() => { setOpenId(null); setAutoExtract(false); }}
        onChanged={() => void fetchPage(null, true)} />

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
