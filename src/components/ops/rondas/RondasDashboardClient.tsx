"use client";

import { RondaProgress } from "@/components/ops/rondas/ronda-progress";
import { TrustScoreBadge } from "@/components/ops/rondas/trust-score-badge";
import { KpiCard, KpiGrid, DataTable } from "@/components/opai";
import type { DataTableColumn } from "@/components/opai";

interface Row {
  id: string;
  status: string;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  trustScore: number;
  scheduledAt: string;
  rondaTemplate: { name: string; installation: { name: string } };
  guardia: { persona: { firstName: string; lastName: string } } | null;
}

interface Stats {
  total: number;
  completadas: number;
  enCurso: number;
  pendientes: number;
  noRealizadas: number;
  trustPromedio: number;
}

const columns: DataTableColumn[] = [
  { key: "ronda", label: "Ronda", render: (_v, row) => row.rondaTemplate.name },
  { key: "instalacion", label: "Instalación", render: (_v, row) => row.rondaTemplate.installation.name },
  {
    key: "guardia",
    label: "Guardia",
    render: (_v, row) =>
      row.guardia ? `${row.guardia.persona.firstName} ${row.guardia.persona.lastName}` : "Sin asignar",
  },
  {
    key: "scheduledAt",
    label: "Programada",
    render: (_v, row) => new Date(row.scheduledAt).toLocaleString("es-CL"),
  },
  { key: "status", label: "Estado" },
  {
    key: "progreso",
    label: "Progreso",
    className: "min-w-[180px]",
    render: (_v, row) => <RondaProgress completed={row.checkpointsCompletados} total={row.checkpointsTotal} />,
  },
  {
    key: "trust",
    label: "Trust",
    render: (_v, row) => <TrustScoreBadge score={row.trustScore} />,
  },
];

export function RondasDashboardClient({
  rows,
  stats,
}: {
  rows: Row[];
  stats: Stats;
}) {
  return (
    <div className="space-y-4">
      <KpiGrid columns={3}>
        <KpiCard title="Total" value={stats.total} />
        <KpiCard title="Completadas" value={stats.completadas} variant="emerald" />
        <KpiCard title="En curso" value={stats.enCurso} variant="blue" />
        <KpiCard title="Pendientes" value={stats.pendientes} variant="amber" />
        <KpiCard title="No realizadas" value={stats.noRealizadas} />
        <KpiCard title="Trust promedio" value={stats.trustPromedio} variant="purple" />
      </KpiGrid>

      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="Sin rondas en el rango seleccionado."
      />
    </div>
  );
}
