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
  if (f === "con_cuenta") return Boolean(t.accountId);
  if (f === "sin_asociar") return !t.accountId;
  if (f === "con_adjuntos") return t.attachmentCount > 0;
  if (f === "leads_creados") return Boolean(t.leadId);
  return true;
}

function matchesQuery(t: CorreoThreadDTO, q: string): boolean {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return [t.subject, t.fromEmail, t.snippet, t.accountName]
    .some((v) => v?.toLowerCase().includes(term));
}

export function CorreosClient() {
  const [items, setItems] = useState<CorreoThreadDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<CorreoFilterKey>("todos");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoExtract, setAutoExtract] = useState(false);

  async function fetchPage(cur: string | null, reset: boolean) {
    setLoading(true);
    try {
      const url = cur ? `/api/crm/correos?cursor=${encodeURIComponent(cur)}` : "/api/crm/correos";
      const r = await fetch(url).then((x) => x.json());
      setConnected(r.connected !== false);
      setItems((prev) => (reset ? r.items ?? [] : [...prev, ...(r.items ?? [])]));
      setCursor(r.nextCursor ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchPage(null, true);
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get("thread");
      if (t) {
        setOpenId(t);
        setAutoExtract(sp.get("extract") === "1");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      <div className="flex justify-end"><ResponseKpiChip /></div>
      <CorreosFilters
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        onSync={syncNow}
        syncing={syncing}
      />

      {!connected ? (
        <EmptyState
          icon={Mail}
          title="Conectá tu Gmail"
          description="Conectá tu casilla en Configuración → Integraciones para ver tus correos comerciales acá."
        />
      ) : loading && items.length === 0 ? (
        <Spinner className="mx-auto" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Sin correos"
          description="No hay hilos que coincidan. Probá 'Sincronizar ahora' o cambiá los filtros."
        />
      ) : (
        <Surface elevation={1} padding="none" className="divide-y divide-ds-border-subtle overflow-hidden">
          {filtered.map((t) => (
            <CorreoRow
              key={t.id}
              thread={t}
              onOpen={() => {
                setOpenId(t.id);
                setAutoExtract(false);
              }}
            />
          ))}
        </Surface>
      )}

      {cursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void fetchPage(cursor, false)}
            disabled={loading}
            className="h-10 rounded-xl border border-ds-border-default px-4 text-[13px] ds-tap disabled:opacity-50 sm:h-9"
          >
            {loading ? "Cargando…" : "Cargar más"}
          </button>
        </div>
      )}

      <CorreoDrawer
        threadId={openId}
        autoExtract={autoExtract}
        onClose={() => {
          setOpenId(null);
          setAutoExtract(false);
        }}
        onChanged={() => void fetchPage(null, true)}
      />
    </div>
  );
}
