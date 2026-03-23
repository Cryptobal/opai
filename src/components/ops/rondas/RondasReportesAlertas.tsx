"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Shield,
  Zap,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPersonName } from "@/lib/personas";

interface AlertaLog {
  id: string;
  action: string;
  userId: string | null;
  userName: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AlertaRow {
  id: string;
  tipo: string;
  severidad: string;
  mensaje: string;
  resuelta: boolean;
  isAcknowledged: boolean;
  acknowledgedAt: string | null;
  resueltaAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  installationId: string;
  installation: { id: string; name: string } | null;
  guardia: { persona: { firstName: string; lastName: string } } | null;
  ejecucion: { id: string; status: string; rondaTemplate: { id: string; name: string } | null } | null;
  logs?: AlertaLog[];
}

interface Props {
  installationId?: string;
  dateFrom: string;
  dateTo: string;
  initialAlertas?: AlertaRow[];
}

const TIPO_CONFIG: Record<string, { label: string; cls: string; icon: typeof AlertTriangle }> = {
  panico: { label: "Panico", cls: "bg-red-500/15 text-red-400", icon: Shield },
  incidente_guardia: { label: "Incidente", cls: "bg-amber-500/15 text-amber-400", icon: AlertTriangle },
  ia_anomalia: { label: "IA", cls: "bg-blue-500/15 text-blue-400", icon: Zap },
  ronda_no_realizada: { label: "No realizada", cls: "bg-orange-500/15 text-orange-400", icon: Clock },
  checkpoint_omitido: { label: "CP omitido", cls: "bg-purple-500/15 text-purple-400", icon: Eye },
};

const SEVERIDAD_CONFIG: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critica", cls: "bg-red-500/15 text-red-400" },
  warning: { label: "Alerta", cls: "bg-amber-500/15 text-amber-400" },
  info: { label: "Info", cls: "bg-blue-500/15 text-blue-400" },
};

const ACTION_LABELS: Record<string, string> = {
  created: "Creada",
  acknowledged: "Atendida",
  resolved: "Resuelta",
  reopened: "Reabierta",
};

function formatTimeDiff(from: string, to: string | null): string {
  const end = to ? new Date(to) : new Date();
  const diffMs = end.getTime() - new Date(from).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

function AlertaRowItem({
  alerta,
  onResolve,
}: {
  alerta: AlertaRow;
  onResolve: (id: string, notes: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveNotes, setResolveNotes] = useState("");

  const tipoConf = TIPO_CONFIG[alerta.tipo] ?? { label: alerta.tipo, cls: "bg-zinc-500/15 text-zinc-400", icon: AlertTriangle };
  const sevConf = SEVERIDAD_CONFIG[alerta.severidad] ?? SEVERIDAD_CONFIG.info;
  const TipoIcon = tipoConf.icon;

  const guardiaNombre = alerta.guardia
    ? formatPersonName(alerta.guardia.persona.firstName, alerta.guardia.persona.lastName)
    : "—";

  const responseTime = alerta.isAcknowledged && alerta.acknowledgedAt
    ? formatTimeDiff(alerta.createdAt, alerta.acknowledgedAt)
    : alerta.resuelta && alerta.resueltaAt
      ? formatTimeDiff(alerta.createdAt, alerta.resueltaAt)
      : null;

  const isPanico = alerta.tipo === "panico";

  async function handleResolve() {
    if (isPanico && resolveNotes.trim().length < 10) {
      toast.error("Las alertas de panico requieren un comentario de al menos 10 caracteres");
      return;
    }
    setResolving(true);
    try {
      await onResolve(alerta.id, resolveNotes);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border/50 bg-[#111827] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs text-muted-foreground tabular-nums w-28 shrink-0">
          {new Date(alerta.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}{" "}
          {new Date(alerta.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium shrink-0", tipoConf.cls)}>
          <TipoIcon className="h-3 w-3" />
          {tipoConf.label}
        </span>
        <span className="text-sm text-foreground truncate flex-1">{alerta.installation?.name ?? "—"}</span>
        <span className="text-xs text-muted-foreground truncate max-w-[140px]">{guardiaNombre}</span>
        <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium shrink-0", sevConf.cls)}>
          {sevConf.label}
        </span>
        {alerta.resuelta ? (
          <span className="inline-flex items-center gap-1 text-emerald-400 text-xs shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Resuelta
          </span>
        ) : alerta.isAcknowledged ? (
          <span className="inline-flex items-center gap-1 text-blue-400 text-xs shrink-0">
            <Eye className="h-3.5 w-3.5" />
            Atendida
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium shrink-0">
            <Clock className="h-3.5 w-3.5" />
            Pendiente
          </span>
        )}
        {responseTime && (
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-16 text-right">
            {responseTime}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 space-y-3 pt-3">
          <p className="text-sm text-foreground/90">{alerta.mensaje}</p>

          {alerta.resolutionNotes && (
            <div className="rounded-md bg-emerald-950/20 border border-emerald-500/20 px-3 py-2">
              <p className="text-[10px] uppercase text-emerald-400/70 font-semibold mb-0.5">Notas de resolucion</p>
              <p className="text-xs text-emerald-300">{alerta.resolutionNotes}</p>
            </div>
          )}

          {/* Audit log timeline */}
          {alerta.logs && alerta.logs.length > 0 && (
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-2">Historial</p>
              <div className="space-y-1">
                {alerta.logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground tabular-nums w-24 shrink-0">
                      {new Date(log.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="font-medium text-foreground">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                    {log.userName && (
                      <span className="text-muted-foreground">por {log.userName}</span>
                    )}
                    {log.notes && (
                      <span className="text-muted-foreground italic truncate flex-1">{log.notes}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolve action */}
          {!alerta.resuelta && (
            <div className="border-t border-border/50 pt-3 space-y-2">
              {isPanico && (
                <textarea
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  placeholder="Comentario de resolucion (obligatorio para panico, min. 10 caracteres)"
                  className="w-full rounded-lg border border-border bg-[#0a0e1a] text-sm text-foreground px-3 py-2 min-h-[60px] resize-none"
                />
              )}
              {!isPanico && (
                <textarea
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  placeholder="Notas de resolucion (opcional)"
                  className="w-full rounded-lg border border-border bg-[#0a0e1a] text-sm text-foreground px-3 py-2 min-h-[40px] resize-none"
                />
              )}
              <button
                onClick={handleResolve}
                disabled={resolving}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              >
                {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Marcar como resuelta
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RondasReportesAlertas({
  installationId,
  dateFrom,
  dateTo,
  initialAlertas,
}: Props) {
  const [alertas, setAlertas] = useState<AlertaRow[]>(initialAlertas ?? []);
  const [loading, setLoading] = useState(!initialAlertas);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const fetchAlertas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: dateFrom,
        to: dateTo,
        open: "false",
        includeLogs: "true",
      });
      if (installationId) params.set("installationId", installationId);
      if (filterType !== "all") params.set("tipo", filterType);
      if (filterStatus !== "all") params.set("status", filterStatus);

      const res = await fetch(`/api/ops/rondas/alertas?${params}`);
      const json = await res.json();
      if (json.success) {
        setAlertas(json.data);
      }
    } catch {
      toast.error("Error cargando alertas");
    } finally {
      setLoading(false);
    }
  }, [installationId, dateFrom, dateTo, filterType, filterStatus]);

  useEffect(() => {
    void fetchAlertas();
  }, [fetchAlertas]);

  const handleResolve = useCallback(async (id: string, notes: string) => {
    try {
      const res = await fetch(`/api/ops/rondas/alertas/${id}/resolve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutionNotes: notes || undefined }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setAlertas((prev) => prev.map((a) => (a.id === id ? { ...a, resuelta: true, resueltaAt: new Date().toISOString(), resolutionNotes: notes } : a)));
        toast.success("Alerta marcada como resuelta");
      } else {
        toast.error(json.error ?? "Error al resolver alerta");
      }
    } catch {
      toast.error("Error al resolver alerta");
    }
  }, []);

  const stats = useMemo(() => {
    const total = alertas.length;
    const panico = alertas.filter((a) => a.tipo === "panico").length;
    const pendientes = alertas.filter((a) => !a.resuelta).length;
    const conRespuesta = alertas.filter((a) => a.isAcknowledged && a.acknowledgedAt);
    const avgMs = conRespuesta.length > 0
      ? conRespuesta.reduce((acc, a) => acc + (new Date(a.acknowledgedAt!).getTime() - new Date(a.createdAt).getTime()), 0) / conRespuesta.length
      : 0;
    const avgMin = Math.round(avgMs / 60000);
    return { total, panico, pendientes, avgResponseTime: conRespuesta.length > 0 ? `${avgMin} min` : "—" };
  }, [alertas]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end rounded-xl border border-[#1a1f2e] bg-[#111827] p-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">Tipo</p>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-9 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] text-[13px] text-[#f1f5f9] px-3"
          >
            <option value="all">Todos los tipos</option>
            <option value="panico">Panico</option>
            <option value="incidente_guardia">Incidentes guardia</option>
            <option value="ia_anomalia">Alertas IA</option>
            <option value="ronda_no_realizada">Ronda no realizada</option>
            <option value="checkpoint_omitido">Checkpoint omitido</option>
          </select>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">Estado</p>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] text-[13px] text-[#f1f5f9] px-3"
          >
            <option value="all">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="resuelta">Resueltas</option>
          </select>
        </div>
        {loading && (
          <div className="flex items-center gap-1.5 text-[#64748b]">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#06b6d4] border-t-transparent animate-spin" />
            <span className="text-[11px]">Cargando...</span>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total alertas", value: stats.total, color: "#94a3b8" },
          { label: "Panico", value: stats.panico, color: "#ef4444" },
          { label: "Pendientes", value: stats.pendientes, color: "#f59e0b" },
          { label: "Tiempo resp. prom.", value: stats.avgResponseTime, color: "#06b6d4" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border bg-[#111827] p-3 relative overflow-hidden"
            style={{ borderColor: `${kpi.color}20`, borderLeftColor: kpi.color, borderLeftWidth: 3 }}
          >
            <p className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{ color: `${kpi.color}99` }}>
              {kpi.label}
            </p>
            <p className="text-2xl font-extrabold tracking-tight" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Alertas list */}
      {alertas.length === 0 && !loading ? (
        <div className="rounded-xl border border-[#1a1f2e] bg-[#111827] p-8 text-center text-sm text-[#64748b]">
          Sin alertas para el periodo seleccionado
        </div>
      ) : (
        <div className="space-y-2">
          {alertas.map((alerta) => (
            <AlertaRowItem key={alerta.id} alerta={alerta} onResolve={handleResolve} />
          ))}
        </div>
      )}
    </div>
  );
}
