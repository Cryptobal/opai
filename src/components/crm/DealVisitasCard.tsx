"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Surface, Tag, Spinner } from "@/components/opai-ds";

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
  }, [dealId]);

  const nextTecnica = rows
    .filter((r) => r.type === "tecnica" && r.status !== "completada")
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  const agendaHref = `/opai/agenda?dealId=${dealId}${
    accountId ? `&accountId=${accountId}` : ""
  }${installationId ? `&installationId=${installationId}` : ""}&nueva=1`;

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
          Visitas del negocio
        </p>
        <Link
          href={agendaHref}
          className="h-10 rounded-xl border border-ds-border-default px-3 text-[12px] text-ds-text-2 ds-tap sm:h-9 inline-flex items-center"
        >
          Agendar visita
        </Link>
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
