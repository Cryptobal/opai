"use client";

import { useMemo, useState } from "react";
import { DataTable, EmptyState, Tag, type DataTableColumn } from "@/components/opai-ds";
import { TrendingUp } from "lucide-react";
import { formatCLP, formatUFSuffix } from "@/lib/utils";
import { ageBucket, daysInStage, sanitizeStageColor } from "@/lib/crm/deal-metrics";
import type { CrmDeal } from "@/types";
import { getDealCommercialIndicators } from "./deals-helpers";

type SortKey = "title" | "amount" | "uf" | "guards" | "days";

type Props = {
  deals: CrmDeal[];
  loading?: boolean;
  emptySearch?: boolean;
  onRowClick: (deal: CrmDeal) => void;
  localTotalClp?: number;
};

export function DealsTable({
  deals,
  loading,
  emptySearch,
  onRowClick,
  localTotalClp,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [asc, setAsc] = useState(false);

  const toggle = (key: SortKey) => {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(false);
    }
  };

  const rows = useMemo(() => {
    const sorted = [...deals].sort((a, b) => {
      const ia = getDealCommercialIndicators(a);
      const ib = getDealCommercialIndicators(b);
      const da = daysInStage(a).days;
      const db = daysInStage(b).days;
      let cmp = 0;
      if (sortKey === "title") cmp = a.title.localeCompare(b.title, "es");
      else if (sortKey === "amount") cmp = ia.amountClp - ib.amountClp;
      else if (sortKey === "uf") cmp = ia.amountUf - ib.amountUf;
      else if (sortKey === "guards") cmp = ia.totalGuards - ib.totalGuards;
      else cmp = da - db;
      return asc ? cmp : -cmp;
    });
    return sorted;
  }, [deals, sortKey, asc]);

  const maxDays = Math.max(1, ...rows.map((d) => daysInStage(d).days));

  const Header = ({ k, label }: { k: SortKey; label: string }) => (
    <button type="button" onClick={() => toggle(k)} className="hover:text-ds-text-1">
      {label}
      {sortKey === k ? (asc ? " ↑" : " ↓") : ""}
    </button>
  );

  const columns: DataTableColumn<CrmDeal>[] = [
    {
      id: "title",
      header: <Header k="title" label="Negocio" />,
      width: "22%",
      cell: (d) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ds-text-1">{d.title}</p>
        </div>
      ),
    },
    {
      id: "account",
      header: "Cuenta",
      width: "16%",
      cell: (d) => <span className="truncate text-ds-text-2">{d.account?.name}</span>,
    },
    {
      id: "stage",
      header: "Etapa",
      width: "12%",
      cell: (d) => {
        const color = sanitizeStageColor(d.stage?.color);
        return (
          <Tag variant="neutral" size="sm">
            {color ? (
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            ) : null}
            {d.stage?.name}
          </Tag>
        );
      },
    },
    {
      id: "amount",
      header: <Header k="amount" label="Monto" />,
      align: "right",
      width: "12%",
      cell: (d) => {
        const { amountClp } = getDealCommercialIndicators(d);
        return amountClp > 0 ? (
          formatCLP(amountClp)
        ) : (
          <span className="text-status-warn-fg">Sin cotiz.</span>
        );
      },
    },
    {
      id: "uf",
      header: <Header k="uf" label="UF" />,
      align: "right",
      width: "10%",
      cell: (d) => formatUFSuffix(getDealCommercialIndicators(d).amountUf),
    },
    {
      id: "guards",
      header: <Header k="guards" label="Puestos" />,
      align: "right",
      width: "8%",
      cell: (d) => getDealCommercialIndicators(d).totalGuards.toLocaleString("es-CL"),
    },
    {
      id: "days",
      header: <Header k="days" label="Días" />,
      align: "right",
      width: "10%",
      cell: (d) => {
        const { days, source } = daysInStage(d);
        const bucket = ageBucket(days);
        const pct = Math.round((days / maxDays) * 100);
        return (
          <div className="flex flex-col items-end gap-0.5" title={source === "created_at" ? "desde creación" : undefined}>
            <span
              className={
                bucket === "ok"
                  ? "text-status-ok-fg"
                  : bucket === "warn"
                    ? "text-status-warn-fg"
                    : "text-status-danger-fg"
              }
            >
              {days}d
            </span>
            <span className="h-1 w-12 overflow-hidden rounded-full bg-ds-surface-3">
              <span
                className="block h-full bg-ds-text-3"
                style={{ width: `${pct}%` }}
              />
            </span>
          </div>
        );
      },
    },
    {
      id: "owner",
      header: "Responsable",
      width: "10%",
      cell: (d) => (
        <span className="truncate text-ds-text-3">{d.account?.name?.split(" ")[0] ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <DataTable
        columns={columns}
        rows={rows}
        layout="fixed"
        rowKey={(d) => d.id}
        onRowClick={onRowClick}
        loading={loading}
        stickyHeader
        empty={
          <EmptyState
            icon={TrendingUp}
            title={emptySearch ? "Sin resultados" : "Sin negocios"}
            description={
              emptySearch
                ? "No hay negocios para la búsqueda o filtro seleccionados."
                : "No hay negocios en esta vista."
            }
            compact
          />
        }
      />
      {localTotalClp != null && rows.length > 0 ? (
        <p className="px-1 text-right text-[12px] tabular-nums text-ds-text-3">
          Total vista: {formatCLP(localTotalClp)}
        </p>
      ) : null}
    </div>
  );
}
