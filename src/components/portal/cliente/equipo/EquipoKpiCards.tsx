"use client";

import { Users, ShieldCheck, AlertTriangle, FileX } from "lucide-react";

interface Props {
  totalGuardias: number;
  os10Vigente: number;
  os10PorVencer: number;
  docsVencidos: number;
}

export function EquipoKpiCards({
  totalGuardias,
  os10Vigente,
  os10PorVencer,
  docsVencidos,
}: Props) {
  const kpis = [
    {
      label: "Total guardias",
      value: totalGuardias,
      icon: Users,
      tone: "text-status-info-fg bg-status-info-soft border-status-info-border",
    },
    {
      label: "OS-10 al día",
      value: os10Vigente,
      icon: ShieldCheck,
      tone: "text-status-ok-fg bg-status-ok-soft border-status-ok-border",
    },
    {
      label: "OS-10 atención",
      value: os10PorVencer,
      icon: AlertTriangle,
      tone: "text-status-warn-fg bg-status-warn-soft border-status-warn-border",
    },
    {
      label: "Docs vencidos",
      value: docsVencidos,
      icon: FileX,
      tone: "text-status-danger-fg bg-status-danger-soft border-status-danger-border",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      {kpis.map((k) => {
        const Icon = k.icon;
        return (
          <div
            key={k.label}
            className={`rounded-xl border px-3 py-2.5 ${k.tone}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider opacity-80">
                {k.label}
              </span>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="text-xl font-semibold font-mono mt-0.5">
              {k.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
