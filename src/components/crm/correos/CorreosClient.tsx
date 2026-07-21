"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { PageHero, Surface, EmptyState, Spinner } from "@/components/opai-ds";
import { CorreosFilters, type CorreoFilterKey } from "./CorreosFilters";
import { CorreoRow } from "./CorreoRow";
import { CorreoDrawer } from "./CorreoDrawer";
import { ResponseKpiChip } from "./ResponseKpiChip";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";

function matchesFilter(t: CorreoThreadDTO, f: CorreoFilterKey): boolean {
  if (f === "archivados") return true; // server ya filtró
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

export function CorreosClient() {
  const [items, setItems] = useState<CorreoThreadDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [canModify, setCanModify] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<CorreoFilterKey>("todos");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState(false);

  async function fetchPage(cur: string | null, reset: boolean, folder?: CorreoFilterKey) {
    setLoading(true);
    try {
      const f = folder ?? filter;
      const qs = new URLSearchParams();
      if (cur) qs.set("cursor", cur);
      if (f === "archivados") qs.set("folder", "archived");
      const r = await fetch(`/api/crm/correos?${qs}`).then((x) => x.json());
      setConnected(r.connected !== false);
      setCanModify(Boolean(r.canModify));
      setItems((prev) => (reset ? r.items ?? [] : [...prev, ...(r.items ?? [])]));
      setCursor(r.nextCursor ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get("thread");
      if (t) {
        setOpenId(t);
        setAutoExtract(sp.get("extract") === "1");
      }
    }
  }, []);

  useEffect(() => {
    void fetchPage(null, true, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function syncNow() {
    setSyncing(true);
    try {
      await fetch("/api/crm/gmail/sync", { method: "POST" });
      await fetchPage(null, true);
    } finally {
      setSyncing(false);
    }
  }

  const filtered = items.filter((t) => matchesFilter(t, filter) && matchesQuery(t, query));

  return (
    <div className="ds-page-enter space-y-5">
      <PageHero
        icon={Mail}
        iconTone="primary"
        title="Correos"
        subtitle="Bandeja comercial"
        description="Hilos de tu Gmail vinculados a cuentas, negocios y leads"
      />

      {connected && !canModify && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
          <span>Reconectá Gmail para habilitar archivar y eliminar</span>
          <a href="/api/crm/gmail/connect" className="font-medium underline underline-offset-2">
            Reconectar Gmail
          </a>
        </div>
      )}

      <div className="flex justify-end"><ResponseKpiChip /></div>
      <CorreosFilters filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} onSync={syncNow} syncing={syncing} />

      {!connected ? (
        <EmptyState icon={Mail} title="Conectá tu Gmail" description="Conectá tu casilla en Integraciones." />
      ) : loading && items.length === 0 ? (
        <Spinner className="mx-auto" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Mail} title="Sin correos" description="Probá sincronizar o cambiá los filtros." />
      ) : (
        <Surface elevation={1} padding="none" className="overflow-hidden">
          {filtered.map((t) => (
            <CorreoRow
              key={t.id}
              thread={t}
              canModify={canModify}
              onChanged={() => void fetchPage(null, true)}
              onOpen={() => { setOpenId(t.id); setAutoExtract(false); }}
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

      <CorreoDrawer threadId={openId} autoExtract={autoExtract} canModify={canModify}
        onClose={() => { setOpenId(null); setAutoExtract(false); }}
        onChanged={() => void fetchPage(null, true)} />
    </div>
  );
}
