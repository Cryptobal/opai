"use client";

import { RondaProgress } from "@/components/ops/rondas/ronda-progress";
import { TrustScoreBadge } from "@/components/ops/rondas/trust-score-badge";

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

export function RondasDashboardClient({
  rows,
  stats,
}: {
  rows: Row[];
  stats: Stats;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="Completadas" value={stats.completadas} />
        <Stat label="En curso" value={stats.enCurso} />
        <Stat label="Pendientes" value={stats.pendientes} />
        <Stat label="No realizadas" value={stats.noRealizadas} />
        <Stat label="Trust promedio" value={stats.trustPromedio} />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ronda</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Instalación</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Guardia</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Programada</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Estado</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Progreso</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Trust</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">{r.rondaTemplate.name}</td>
                  <td className="px-3 py-2">{r.rondaTemplate.installation.name}</td>
                  <td className="px-3 py-2">
                    {r.guardia ? `${r.guardia.persona.firstName} ${r.guardia.persona.lastName}` : "Sin asignar"}
                  </td>
                  <td className="px-3 py-2">{new Date(r.scheduledAt).toLocaleString("es-CL")}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 min-w-[180px]">
                    <RondaProgress completed={r.checkpointsCompletados} total={r.checkpointsTotal} />
                  </td>
                  <td className="px-3 py-2">
                    <TrustScoreBadge score={r.trustScore} />
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>
                    Sin rondas en el rango seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
