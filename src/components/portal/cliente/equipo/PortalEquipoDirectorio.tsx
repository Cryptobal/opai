"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, Loader2 } from "lucide-react";
import { PreviewBadge } from "../PreviewBadge";
import { EquipoKpiCards } from "./EquipoKpiCards";
import { EquipoFiltros, type EquipoFiltro } from "./EquipoFiltros";
import { EquipoGrupoInstalacion } from "./EquipoGrupoInstalacion";
import type { GuardiaSummary } from "@/lib/portal-cliente-guardias";

interface Grupo {
  installation: { id: string; name: string };
  guardias: GuardiaSummary[];
  resumen: {
    total: number;
    os10Vigente: number;
    os10PorVencer: number;
    os10Vencido: number;
  };
}

interface EquipoData {
  grupos: Grupo[];
  resumen: {
    totalGuardias: number;
    totalInstalaciones: number;
    os10Vigente: number;
    os10PorVencer: number;
    os10Vencido: number;
    docsPendientes: number;
    docsVencidos: number;
  };
}

interface Props {
  isProspect?: boolean;
}

export function PortalEquipoDirectorio({ isProspect }: Props) {
  const router = useRouter();
  const [data, setData] = useState<EquipoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<EquipoFiltro>("todos");

  useEffect(() => {
    let active = true;
    fetch("/api/portal/cliente/equipo")
      .then((r) => r.json())
      .then((res) => {
        if (!active) return;
        if (res.success) setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[PortalEquipoDirectorio] fetch error:", err);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const gruposFiltrados = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.grupos
      .map((g) => ({
        ...g,
        guardias: g.guardias.filter((guard) => {
          if (q && !guard.nombre.toLowerCase().includes(q)) return false;
          if (filtro === "os10_vigente" && guard.os10Estado !== "vigente")
            return false;
          if (filtro === "os10_por_vencer" && guard.os10Estado !== "por_vencer")
            return false;
          if (
            filtro === "os10_vencido" &&
            guard.os10Estado !== "vencido" &&
            guard.os10Estado !== "pendiente"
          )
            return false;
          if (filtro === "docs_vencidos" && guard.resumen.vencidos === 0)
            return false;
          return true;
        }),
      }))
      .filter((g) => g.guardias.length > 0);
  }, [data, query, filtro]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Cargando equipo...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-sm text-zinc-500">
        No se pudo cargar el equipo. Recarga la página.
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 pb-24">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-status-info-fg" />
          <h2 className="text-lg font-semibold">Equipo de guardias</h2>
        </div>
        {isProspect && <PreviewBadge />}
      </div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] uppercase tracking-wider text-status-info-fg/80 bg-status-info-soft border border-status-info-border rounded-full px-2 py-0.5">
          Cumplimiento automático
        </span>
      </div>

      <EquipoKpiCards
        totalGuardias={data.resumen.totalGuardias}
        os10Vigente={data.resumen.os10Vigente}
        os10PorVencer={data.resumen.os10PorVencer}
        docsVencidos={data.resumen.docsVencidos}
      />

      <EquipoFiltros
        query={query}
        onQuery={setQuery}
        filtro={filtro}
        onFiltro={setFiltro}
      />

      {gruposFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-zinc-500">
          <UserCheck className="h-8 w-8" />
          <p className="text-sm">No hay guardias asignados</p>
          <p className="text-xs text-zinc-500 text-center px-8">
            Los guardias aparecerán aquí cuando sean asignados a tus
            instalaciones.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {gruposFiltrados.map((grupo) => (
            <EquipoGrupoInstalacion
              key={grupo.installation.id}
              grupo={grupo}
              onOpenGuardia={(id) => router.push(`/portal/cliente/guardia/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
