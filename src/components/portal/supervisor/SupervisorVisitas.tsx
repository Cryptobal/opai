"use client";

import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  Plus,
  Loader2,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { EmptyState } from "@/components/opai/EmptyState";

interface Visit {
  id: string;
  installationName: string;
  accountName: string;
  status: string;
  checkInAt: string;
  checkOutAt: string | null;
  durationMinutes: number | null;
  healthScore: number | null;
  wizardStep: number;
}

type Tab = "en_curso" | "completadas" | "todas";

interface Props {
  onNewVisit: () => void;
  onSelectVisit: (visitId: string) => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  in_progress: {
    label: "En curso",
    icon: Clock,
    color: "text-blue-400",
    bg: "bg-blue-500/15",
  },
  completed: {
    label: "Completada",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
  },
  cancelled: {
    label: "Cancelada",
    icon: XCircle,
    color: "text-zinc-500",
    bg: "bg-zinc-700/30",
  },
  draft: {
    label: "Borrador",
    icon: AlertTriangle,
    color: "text-amber-400",
    bg: "bg-amber-500/15",
  },
};

export function SupervisorVisitas({ onNewVisit, onSelectVisit }: Props) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("en_curso");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/ops/supervision?mine=true");
        if (res.ok) {
          const json = await res.json();
          setVisits(
            (json.data ?? []).map((v: Record<string, unknown>) => ({
              id: v.id,
              installationName: (v.installation as Record<string, unknown>)?.name ?? "Instalación",
              accountName: (v.installation as Record<string, unknown>)?.clientName ?? "",
              status: v.status ?? "draft",
              checkInAt: v.checkInAt,
              checkOutAt: v.checkOutAt ?? null,
              durationMinutes: v.durationMinutes ?? null,
              healthScore: v.healthScore ?? null,
              wizardStep: v.wizardStep ?? 1,
            }))
          );
        }
      } catch {
        // noop
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = visits.filter((v) => {
    if (tab === "en_curso") return v.status === "in_progress" || v.status === "draft";
    if (tab === "completadas") return v.status === "completed";
    return true;
  });

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "en_curso", label: "En curso" },
    { id: "completadas", label: "Completadas" },
    { id: "todas", label: "Todas" },
  ];

  return (
    <div className="flex flex-col gap-3 px-4 py-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Visitas de Supervisión</h2>
        <button
          onClick={onNewVisit}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          <Plus size={14} />
          Nueva
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === id ? "bg-zinc-700 text-white" : "text-zinc-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-zinc-600" size={24} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={24} />}
          title="Sin visitas"
          description={
            tab === "en_curso"
              ? "No tienes visitas en curso. Inicia una nueva visita."
              : "No hay visitas en esta categoría."
          }
          action={
            tab === "en_curso" ? (
              <button
                onClick={onNewVisit}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium"
              >
                Iniciar visita
              </button>
            ) : undefined
          }
          compact
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((v) => (
            <VisitCard key={v.id} visit={v} onSelect={() => onSelectVisit(v.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function VisitCard({
  visit,
  onSelect,
}: {
  visit: Visit;
  onSelect: () => void;
}) {
  const cfg = STATUS_CONFIG[visit.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = cfg.icon;

  const checkInDate = new Date(visit.checkInAt);
  const dateStr = checkInDate.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
  });
  const timeStr = checkInDate.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors text-left w-full"
    >
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg}`}
      >
        <StatusIcon size={18} className={cfg.color} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{visit.installationName}</p>
        <p className="text-xs text-zinc-500 truncate">{visit.accountName}</p>
        <p className="text-xs text-zinc-600 mt-0.5">
          {dateStr} · {timeStr}
          {visit.durationMinutes ? ` · ${visit.durationMinutes} min` : ""}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {visit.healthScore != null ? (
          <span
            className={`text-sm font-semibold ${
              visit.healthScore >= 80
                ? "text-emerald-400"
                : visit.healthScore >= 60
                ? "text-amber-400"
                : "text-red-400"
            }`}
          >
            {visit.healthScore}%
          </span>
        ) : (
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        )}
        <ChevronRight size={14} className="text-zinc-600" />
      </div>
    </button>
  );
}
