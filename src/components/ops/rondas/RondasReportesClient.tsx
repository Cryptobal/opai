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
          className="h-10 min-w-[240px] rounded border border-border bg-background px-3 text-sm"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          className="h-10"
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
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Instalación</th>
                <th className="px-3 py-2 text-left">Ronda</th>
                <th className="px-3 py-2 text-left">Guardia</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-right">Progreso</th>
                <th className="px-3 py-2 text-right">Trust</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr key={`${r.scheduledAt}-${idx}`} className="border-t border-border">
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
