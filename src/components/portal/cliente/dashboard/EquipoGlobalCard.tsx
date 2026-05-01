"use client";

import { useEffect, useState } from "react";
import { Users, ChevronRight, Building2, ShieldCheck, AlertTriangle } from "lucide-react";

interface EquipoResumen {
  totalGuardias: number;
  totalInstalaciones: number;
  os10Vigente: number;
  os10PorVencer: number;
  os10Vencido: number;
  docsPendientes: number;
  docsVencidos: number;
}

interface Props {
  onNavigate: (section: string) => void;
  isProspect?: boolean;
}

export function EquipoGlobalCard({ onNavigate, isProspect }: Props) {
  const [resumen, setResumen] = useState<EquipoResumen | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/portal/cliente/equipo")
      .then((r) => r.json())
      .then((res) => {
        if (!active) return;
        if (res.success) setResumen(res.data.resumen);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[EquipoGlobalCard] fetch error:", err);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading || !resumen) return null;
  if (resumen.totalGuardias === 0 && !isProspect) return null;

  const os10Pct =
    resumen.totalGuardias > 0
      ? Math.round((resumen.os10Vigente * 100) / resumen.totalGuardias)
      : 0;
  const hasAttention =
    resumen.os10PorVencer > 0 ||
    resumen.os10Vencido > 0 ||
    resumen.docsVencidos > 0;

  return (
    <button
      onClick={() => onNavigate("personal")}
      className="w-full text-left rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-status-info-fg" />
          <h3 className="text-sm font-semibold">Mi equipo</h3>
        </div>
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <span>Ver detalle</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat
          icon={Users}
          value={resumen.totalGuardias}
          label="guardias"
        />
        <Stat
          icon={Building2}
          value={resumen.totalInstalaciones}
          label={
            resumen.totalInstalaciones === 1 ? "instalación" : "instalaciones"
          }
        />
        <Stat
          icon={ShieldCheck}
          value={`${os10Pct}%`}
          label="OS-10 al día"
          tone={
            os10Pct >= 95
              ? "text-status-ok-fg"
              : os10Pct >= 80
                ? "text-status-warn-fg"
                : "text-status-danger-fg"
          }
        />
      </div>

      {hasAttention && (
        <div className="flex items-center gap-2 mt-3 text-[11px] text-status-warn-fg">
          <AlertTriangle className="h-3 w-3" />
          <span>
            {resumen.os10Vencido > 0 && (
              <>
                {resumen.os10Vencido} OS-10 vencido
                {resumen.os10Vencido > 1 ? "s" : ""}
                {(resumen.os10PorVencer > 0 || resumen.docsVencidos > 0) &&
                  " · "}
              </>
            )}
            {resumen.os10PorVencer > 0 && (
              <>
                {resumen.os10PorVencer} por vencer
                {resumen.docsVencidos > 0 && " · "}
              </>
            )}
            {resumen.docsVencidos > 0 && (
              <>
                {resumen.docsVencidos} doc{resumen.docsVencidos > 1 ? "s" : ""}{" "}
                vencido{resumen.docsVencidos > 1 ? "s" : ""}
              </>
            )}
          </span>
        </div>
      )}
    </button>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  tone = "text-zinc-200",
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
  label: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-2.5">
      <Icon className="h-3.5 w-3.5 text-zinc-500 mb-1" />
      <div className={`text-lg font-mono font-semibold ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
    </div>
  );
}
