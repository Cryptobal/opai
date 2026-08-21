"use client";

import { useEffect, useState } from "react";
import { Stat, StatGrid } from "@/components/opai-ds";

export function IncidentesTerrenoKpis() {
  const [kpis, setKpis] = useState<{
    abiertos: number;
    porValidar: number;
    slaVencido: number;
    tRespuestaLabel: string;
    pctValidados30d: number | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/ops/supervision/incidentes?filter=all")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setKpis(j.data.kpis);
      })
      .catch(() => {});
  }, []);

  if (!kpis) return null;
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium">Incidentes en terreno</p>
      <StatGrid cols={2} lgCols={4}>
        <Stat label="Abiertos" value={kpis.abiertos} />
        <Stat label="Por validar" value={kpis.porValidar} />
        <Stat label="SLA vencido" value={kpis.slaVencido} />
        <Stat label="T° respuesta" value={kpis.tRespuestaLabel} />
        <Stat label="% validados 30d" value={kpis.pctValidados30d == null ? "—" : `${kpis.pctValidados30d}%`} />
      </StatGrid>
    </div>
  );
}
