"use client";

import { useEffect, useState } from "react";
import { MonitoreoMap } from "@/components/ops/rondas/monitoreo-map";
import { RondaProgress } from "@/components/ops/rondas/ronda-progress";
import { TrustScoreBadge } from "@/components/ops/rondas/trust-score-badge";

export function RondasMonitoreoClient({ initialRows }: { initialRows: any[] }) {
  const [rows, setRows] = useState<any[]>(initialRows);

  useEffect(() => {
    const i = setInterval(async () => {
      const res = await fetch("/api/ops/rondas/monitoreo");
      const json = await res.json();
      if (json.success) setRows(json.data);
    }, 30000);
    return () => clearInterval(i);
  }, []);

  const points = rows.map((r) => {
    const lastMark = r.marcaciones?.[0];
    return {
      id: r.id,
      label: `${r.rondaTemplate.name} - ${r.rondaTemplate.installation.name}`,
      lat: lastMark?.lat ?? r.rondaTemplate.installation.lat,
      lng: lastMark?.lng ?? r.rondaTemplate.installation.lng,
      status: r.status,
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3">
        <MonitoreoMap points={points} />
      </div>
      <div className="lg:col-span-2 space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
            <p className="text-sm font-medium">{r.rondaTemplate.name}</p>
            <p className="text-xs text-muted-foreground">{r.rondaTemplate.installation.name}</p>
            <RondaProgress completed={r.checkpointsCompletados} total={r.checkpointsTotal} />
            <TrustScoreBadge score={r.trustScore} />
          </div>
        ))}
        {!rows.length && (
          <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
            No hay rondas activas en este momento.
          </div>
        )}
      </div>
    </div>
  );
}
