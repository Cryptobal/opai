"use client";

import { useEffect, useState } from "react";
import { Surface, Tag, Spinner } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { NuevaVisitaModal } from "@/components/agenda/NuevaVisitaModal";

type VisitRow = {
  id: string;
  source: string;
  type: string;
  start: string;
  assignedName: string | null;
  status: string;
  syncStatus: string | null;
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
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    const to = new Date();
    to.setMonth(to.getMonth() + 12);
    fetch(`/api/agenda?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const items = (j.items ?? []).filter(
          (i: VisitRow & { dealId?: string | null }) => i.dealId === dealId,
        );
        setRows(items);
      })
      .catch(() => setRows([]))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dealId, refreshKey]);

  const nextTecnica = rows
    .filter((r) => r.type === "tecnica" && r.status !== "completada")
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <NuevaVisitaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        dealId={dealId}
        accountId={accountId}
        installationId={installationId}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
          Visitas del negocio
        </p>
        <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
          Agendar visita
        </Button>
      </div>
      {nextTecnica && (
        <p className="text-[12px] text-ds-text-3">
          Próxima visita técnica:{" "}
          <span className="text-ds-text-2">
            {new Date(nextTecnica.start).toLocaleString("es-CL")}
          </span>
        </p>
      )}
      {loading ? (
        <Spinner className="mx-auto" />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-ds-text-3">Sin visitas vinculadas a este negocio.</p>
      ) : (
        <ul className="divide-y divide-ds-border-subtle rounded-xl border border-ds-border-subtle">
          {rows.map((r) => (
            <li key={`${r.source}-${r.id}`} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-ds-text-1">
                  {r.type} · {new Date(r.start).toLocaleString("es-CL")}
                </p>
                <p className="truncate text-[12px] text-ds-text-4">
                  {r.assignedName || "Sin asignar"} · {r.status}
                </p>
              </div>
              {r.syncStatus && (
                <Tag
                  variant={r.syncStatus === "SYNCED" ? "ok" : r.syncStatus === "ERROR" ? "danger" : "warn"}
                  size="sm"
                >
                  {r.syncStatus}
                </Tag>
              )}
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
