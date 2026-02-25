"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

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
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat label="Total" value={totals.total ?? 0} />
        <Stat label="Completadas" value={totals.completadas ?? 0} />
        <Stat label="Incompletas" value={totals.incompletas ?? 0} />
        <Stat label="No realizadas" value={totals.noRealizadas ?? 0} />
        <Stat label="Cumplimiento %" value={totals.compliance ?? 0} />
        <Stat label="Trust promedio" value={totals.trustPromedio ?? 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fecha</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Instalación</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ronda</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Guardia</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Estado</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Progreso</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Trust</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr key={`${r.scheduledAt}-${idx}`} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">{new Date(r.scheduledAt).toLocaleString("es-CL")}</td>
                  <td className="px-3 py-2">{r.installation}</td>
                  <td className="px-3 py-2">{r.template}</td>
                  <td className="px-3 py-2">{r.guardia}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 text-right">{Math.round(r.porcentajeCompletado)}%</td>
                  <td className="px-3 py-2 text-right">{r.trustScore}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Sin resultados.
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
