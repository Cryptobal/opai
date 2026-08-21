"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Siren } from "lucide-react";
import { Surface, Stat } from "@/components/opai-ds";

export function IncidentesSupervisionCard() {
  const [kpis, setKpis] = useState<{ porValidar: number; abiertos: number } | null>(null);

  useEffect(() => {
    fetch("/api/ops/supervision/incidentes?filter=por_validar")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setKpis({ porValidar: j.data.kpis.porValidar, abiertos: j.data.kpis.abiertos });
      })
      .catch(() => {});
  }, []);

  return (
    <Link href="/ops/supervision/incidentes" className="block">
      <Surface tappable padding="md" className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-status-warn-soft text-status-warn-fg">
            <Siren className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-base">Incidentes en terreno</p>
            <p className="text-[13px] text-ds-text-3">
              {kpis
                ? `${kpis.porValidar} por validar · ${kpis.abiertos} activos`
                : "Seguimiento de reportes QR"}
            </p>
          </div>
        </div>
        {kpis ? <Stat label="Por validar" value={kpis.porValidar} /> : null}
      </Surface>
    </Link>
  );
}
