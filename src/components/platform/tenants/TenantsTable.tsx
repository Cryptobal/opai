"use client";

import Link from "next/link";
import { DataTable, EmptyState, MetricBar, Skeleton, Tag, type DataTableColumn } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import type { PlatformTenantRow } from "@/lib/platform/tenant-row";
import { planTintClass } from "@/lib/platform/status-ui";
import { StatusTag } from "../StatusTag";
import { formatClDateTime, formatUf } from "../format";
import { impersonateTenant } from "../impersonate";
import { cn } from "@/lib/utils";

function monthlyCell(row: PlatformTenantRow) {
  if (row.monthly.kind === "pending") {
    return <span className="text-[13px] text-status-warn-fg">Precio pendiente</span>;
  }
  if (row.monthly.kind === "trial") {
    return <span className="font-mono text-[13px] text-ds-text-3">—</span>;
  }
  if (row.monthly.kind === "exempt") {
    return <span className="text-[13px] text-ds-text-3">Exento</span>;
  }
  if (row.monthly.kind === "amount" && row.monthly.total != null) {
    return <span className="font-mono text-[13px] tabular-nums">{formatUf(row.monthly.total)}</span>;
  }
  return <span className="font-mono text-[13px] text-ds-text-3">—</span>;
}

function guardsCell(row: PlatformTenantRow) {
  const cap = row.maxGuards > 0;
  const pct = cap ? Math.min(100, (row.activeGuards / row.maxGuards) * 100) : 0;
  return (
    <div className="min-w-[5.5rem]">
      <span className="font-mono text-[13px] tabular-nums">{row.activeGuards}</span>
      {cap ? <MetricBar value={pct} className="mt-1" /> : null}
    </div>
  );
}

export function TenantsTable({
  rows,
  loading,
  emptyTitle = "Sin tenants",
  emptyDescription,
}: {
  rows: PlatformTenantRow[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const columns: DataTableColumn<PlatformTenantRow>[] = [
    {
      id: "empresa",
      header: "Empresa",
      cell: (row) => (
        <Link href={`/platform/tenants/${row.id}`} className="block min-w-0 hover:text-primary">
          <div className="truncate font-medium text-ds-text-1">{row.name}</div>
          <div className="truncate font-mono text-[12px] text-ds-text-3">{row.slug}</div>
        </Link>
      ),
    },
    {
      id: "estado",
      header: "Estado",
      cell: (row) => <StatusTag label={row.statusLabel} variant={row.statusVariant} />,
    },
    {
      id: "plan",
      header: "Plan",
      cell: (row) =>
        row.plan ? (
          <Tag size="sm" className={cn("border-0", planTintClass(row.plan) || undefined)}>
            {row.plan}
          </Tag>
        ) : (
          <Tag size="sm" variant="neutral">
            Sin plan
          </Tag>
        ),
    },
    { id: "guardias", header: "Guardias", cell: guardsCell },
    { id: "mensual", header: "Mensual", cell: monthlyCell },
    {
      id: "uso",
      header: "Uso 30 d",
      hideOnMobile: true,
      cell: () => <span className="text-[13px] text-ds-text-4">Sin datos</span>,
    },
    {
      id: "actividad",
      header: "Última actividad",
      hideOnMobile: true,
      cell: (row) => (
        <span className="font-mono text-[12px] text-ds-text-3">
          {formatClDateTime(row.lastActivityAt)}
        </span>
      ),
    },
    {
      id: "acciones",
      header: "",
      sticky: "right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="secondary" size="sm" className="h-10 sm:h-9">
            <Link href={`/platform/tenants/${row.id}`}>Gestionar</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 sm:h-9"
            onClick={() => impersonateTenant(row.id)}
          >
            Entrar
          </Button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={
          <EmptyState
            icon={Building2}
            title={emptyTitle}
            description={emptyDescription}
            compact
          />
        }
      />
    </div>
  );
}
