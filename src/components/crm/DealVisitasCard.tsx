"use client";

import { useEffect, useState } from "react";
import { Surface, Tag, Spinner } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { ExternalLink, Pencil } from "lucide-react";
import { NuevaVisitaModal } from "@/components/agenda/NuevaVisitaModal";

type VisitRow = {
  id: string;
  source: string;
  type: string;
  title?: string;
  label?: string | null;
  start: string;
  assignedName: string | null;
  status: string;
  syncStatus: string | null;
  htmlLink?: string | null;
};

type Props = {
  dealId: string;
  accountId?: string | null;
  installationId?: string | null;
};

export function DealVisitasCard({ dealId, accountId, installationId }: Props) {
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    const to = new Date();
    to.setMonth(to.getMonth() + 12);
    setLoading(true);
    fetch(
      `/api/agenda?from=${from.toISOString()}&to=${to.toISOString()}&dealId=${encodeURIComponent(dealId)}`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setRows(j.items ?? []);
      })
      .catch(() => setRows([]))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dealId, refreshKey]);

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <NuevaVisitaModal
        open={modalOpen}
        onOpenChange={(v) => {
          setModalOpen(v);
          if (!v) setEditId(null);
        }}
        dealId={dealId}
        accountId={accountId}
        installationId={installationId}
        editEventId={editId}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
          Agenda del negocio
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-10 sm:h-9"
          onClick={() => {
            setEditId(null);
            setModalOpen(true);
          }}
        >
          Agendar
        </Button>
      </div>
      {loading ? (
        <Spinner className="mx-auto" />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-ds-text-3">
          Sin eventos vinculados a este negocio.
        </p>
      ) : (
        <ul className="divide-y divide-ds-border-subtle rounded-xl border border-ds-border-subtle">
          {rows.map((r) => (
            <li
              key={`${r.source}-${r.id}`}
              className="flex items-center justify-between gap-2 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.label && (
                    <Tag variant="neutral" size="sm">
                      {r.label}
                    </Tag>
                  )}
                  <p className="truncate text-[13px] font-medium text-ds-text-1">
                    {r.title || r.type}
                  </p>
                </div>
                <p className="truncate text-[12px] text-ds-text-4">
                  {new Date(r.start).toLocaleString("es-CL")}
                  {r.assignedName ? ` · ${r.assignedName}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {r.syncStatus && (
                  <Tag
                    variant={
                      r.syncStatus === "SYNCED"
                        ? "ok"
                        : r.syncStatus === "ERROR"
                          ? "danger"
                          : "warn"
                    }
                    size="sm"
                  >
                    {r.syncStatus}
                  </Tag>
                )}
                {r.htmlLink && (
                  <a
                    href={r.htmlLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 sm:h-9 sm:w-9"
                    title="Abrir en Google"
                    aria-label="Abrir en Google"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                {r.source === "agenda_visita" && (
                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 sm:h-9 sm:w-9"
                    title="Editar"
                    aria-label="Editar evento"
                    onClick={() => {
                      setEditId(r.id);
                      setModalOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
