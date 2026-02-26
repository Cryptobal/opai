"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { KpiCard, KpiGrid, DataTable, FilterBar } from "@/components/opai";
import type { DataTableColumn } from "@/components/opai";

const columns: DataTableColumn[] = [
  {
    key: "scheduledAt",
    label: "Fecha",
    render: (_v, row) => new Date(row.scheduledAt).toLocaleString("es-CL"),
  },
  { key: "installation", label: "Instalación" },
  { key: "template", label: "Ronda" },
  { key: "guardia", label: "Guardia" },
  { key: "status", label: "Estado" },
  {
    key: "porcentajeCompletado",
    label: "Progreso",
    className: "text-right",
    render: (v) => `${Math.round(v)}%`,
  },
  {
    key: "trustScore",
    label: "Trust",
    className: "text-right",
  },
];

export function RondasReportesClient({ rows, totals }: { rows: any[]; totals: any }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        `${r.installation} ${r.template} ${r.guardia} ${r.status}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [rows, search],
  );

  return (
    <div className="space-y-4">
      <KpiGrid columns={3}>
        <KpiCard title="Total" value={totals.total ?? 0} />
        <KpiCard title="Completadas" value={totals.completadas ?? 0} variant="emerald" />
        <KpiCard title="Incompletas" value={totals.incompletas ?? 0} variant="amber" />
        <KpiCard title="No realizadas" value={totals.noRealizadas ?? 0} />
        <KpiCard title="Cumplimiento %" value={totals.compliance ?? 0} variant="blue" />
        <KpiCard title="Trust promedio" value={totals.trustPromedio ?? 0} variant="purple" />
      </KpiGrid>

      <FilterBar>
        <input
          className="h-9 min-w-[240px] rounded border border-border bg-background px-3 text-sm"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          className="h-9"
          variant="outline"
          onClick={() => {
            window.location.href = "/api/ops/rondas/reportes?format=csv";
          }}
        >
          Exportar CSV
        </Button>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage="Sin resultados."
      />
    </div>
  );
}
