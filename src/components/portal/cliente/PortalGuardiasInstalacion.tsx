"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  ChevronDown,
  ChevronRight,
  UserCheck,
  FileCheck,
  Eye,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { portalFetch } from "@/lib/portal-cliente-fetch";

type DocEstado = "vigente" | "por_vencer" | "vencido" | "pendiente" | "no_aplica";

interface GuardiaDoc {
  tipo: string;
  estado: DocEstado;
  expiresAt: string | null;
  fileUrl: string | null;
}

interface Guardia {
  id: string;
  nombre: string;
  iniciales: string;
  hiredAt: string | null;
  os10Estado: DocEstado;
  os10ExpiresAt: string | null;
  documentos: GuardiaDoc[];
  resumen: {
    total: number;
    vigentes: number;
    porVencer: number;
    vencidos: number;
    pendientes: number;
  };
}

interface Payload {
  guardias: Guardia[];
  resumen: {
    totalGuardias: number;
    os10Vigente: number;
    os10PorVencer: number;
    os10Vencido: number;
  };
}

interface Props {
  installationId: string;
}

const DOC_ESTADO_CFG: Record<
  DocEstado,
  { label: string; color: string; Icon: typeof CheckCircle2 }
> = {
  vigente: {
    label: "Vigente",
    color: "text-status-ok-fg bg-status-ok-soft border-status-ok-border",
    Icon: CheckCircle2,
  },
  no_aplica: {
    label: "Vigente",
    color: "text-status-ok-fg bg-status-ok-soft border-status-ok-border",
    Icon: CheckCircle2,
  },
  por_vencer: {
    label: "Por vencer",
    color: "text-status-warn-fg bg-status-warn-soft border-status-warn-border",
    Icon: AlertTriangle,
  },
  vencido: {
    label: "Vencido",
    color: "text-status-danger-fg bg-status-danger-soft border-status-danger-border",
    Icon: XCircle,
  },
  pendiente: {
    label: "Pendiente",
    color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
    Icon: Clock,
  },
};

function DocEstadoChip({ estado }: { estado: DocEstado }) {
  const cfg = DOC_ESTADO_CFG[estado];
  const { Icon } = cfg;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border",
        cfg.color
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

function formatDocType(type: string): string {
  const map: Record<string, string> = {
    certificado_os10: "Certificado OS-10",
    credencial_os10: "Credencial OS-10",
    certificado_antecedentes: "Certificado de antecedentes",
    contrato: "Contrato de trabajo",
    cedula_identidad: "Cédula de identidad",
    examen_medico: "Examen médico",
    curso_oficial: "Curso oficial de guardia",
  };
  return (
    map[type] ??
    type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PortalGuardiasInstalacion({ installationId }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setExpandedId(null);

    (async () => {
      try {
        const res = await portalFetch(
          `/api/portal/cliente/instalaciones/${installationId}/guardias`
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "No se pudo cargar el equipo");
        }
        if (!cancelled) setData(json.data as Payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [installationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Cargando equipo…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-400">
        No se pudo cargar el equipo: {error}
      </div>
    );
  }

  if (!data || data.guardias.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-6 text-center text-xs text-zinc-500">
        <UserCheck className="h-6 w-6 text-zinc-600 mx-auto mb-2" />
        No hay guardias asignados actualmente a esta instalación.
      </div>
    );
  }

  const { guardias, resumen } = data;

  return (
    <div className="space-y-3">
      {/* KPIs globales del equipo */}
      <div className="grid grid-cols-3 gap-2">
        <KpiChip
          label="Guardias"
          value={resumen.totalGuardias}
          Icon={UserCheck}
          tone="neutral"
        />
        <KpiChip
          label="OS-10 OK"
          value={resumen.os10Vigente}
          Icon={ShieldCheck}
          tone="emerald"
        />
        <KpiChip
          label="Atención"
          value={resumen.os10PorVencer + resumen.os10Vencido}
          Icon={resumen.os10Vencido > 0 ? ShieldOff : ShieldAlert}
          tone={resumen.os10Vencido > 0 ? "red" : "amber"}
        />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-white/[0.02] overflow-hidden divide-y divide-white/[0.04]">
        {guardias.map((g) => {
          const isOpen = expandedId === g.id;
          return (
            <div key={g.id}>
              <button
                onClick={() => setExpandedId(isOpen ? null : g.id)}
                className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-teal-600/20 border border-status-info-border flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-status-info-fg">
                    {g.iniciales}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{g.nombre}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <DocEstadoChip estado={g.os10Estado} />
                    <span className="text-[10px] text-zinc-500">
                      OS-10
                      {g.os10ExpiresAt
                        ? ` · vence ${formatDate(g.os10ExpiresAt)}`
                        : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {g.resumen.vencidos > 0 ? (
                    <span className="text-[10px] font-semibold text-status-danger-fg">
                      {g.resumen.vencidos} venc
                    </span>
                  ) : g.resumen.porVencer > 0 ? (
                    <span className="text-[10px] font-semibold text-status-warn-fg">
                      {g.resumen.porVencer} por vencer
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-status-ok-fg">
                      Al día
                    </span>
                  )}
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-zinc-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-zinc-500" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-white/[0.04] px-3 py-2 bg-white/[0.01]">
                  {g.documentos.length === 0 ? (
                    <p className="text-[11px] text-zinc-500 py-2">
                      Sin documentos visibles en el portal.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {g.documentos.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.02]"
                        >
                          <FileCheck className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-zinc-200 truncate">
                              {formatDocType(d.tipo)}
                            </p>
                            {d.expiresAt && (
                              <p className="text-[10px] text-zinc-500">
                                Vence {formatDate(d.expiresAt)}
                              </p>
                            )}
                          </div>
                          <DocEstadoChip estado={d.estado} />
                          {d.fileUrl && (
                            <a
                              href={d.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded hover:bg-white/10 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                              title="Ver documento"
                            >
                              <Eye className="h-3.5 w-3.5 text-zinc-400" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiChip({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: number;
  Icon: typeof CheckCircle2;
  tone: "neutral" | "emerald" | "amber" | "red";
}) {
  const toneCls = {
    neutral: "text-zinc-300 bg-white/[0.03]",
    emerald: "text-status-ok-fg bg-status-ok-soft",
    amber: "text-status-warn-fg bg-status-warn-soft",
    red: "text-status-danger-fg bg-status-danger-soft",
  }[tone];
  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 px-3 py-2 flex items-center gap-2",
        toneCls
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div>
        <p className="text-sm font-bold tabular-nums leading-tight">{value}</p>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider leading-tight">
          {label}
        </p>
      </div>
    </div>
  );
}
