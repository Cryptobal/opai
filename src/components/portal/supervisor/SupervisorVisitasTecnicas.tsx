"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Plus, Loader2, MapPin, Clock, CheckCircle2, FileEdit } from "lucide-react";
import { EmptyState } from "@/components/opai/EmptyState";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface VisitaTecnica {
  id: string;
  status: string;
  installationId: string;
  accountId: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  durationMinutes: number | null;
  generalReport: string | null;
  createdAt: string;
  installation: { id: string; name: string } | null;
  account: { id: string; name: string } | null;
}

interface Props {
  installations: SupervisorInstallation[];
  onNew: () => void;
  onSelect: (visita: VisitaTecnica) => void;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  borrador: { label: "Borrador", color: "text-zinc-400", icon: <FileEdit size={12} /> },
  en_curso: { label: "En curso", color: "text-blue-400", icon: <MapPin size={12} /> },
  completada: { label: "Completada", color: "text-emerald-400", icon: <CheckCircle2 size={12} /> },
};

export function SupervisorVisitasTecnicas({ installations, onNew, onSelect }: Props) {
  const [items, setItems] = useState<VisitaTecnica[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"todos" | "borrador" | "en_curso" | "completada">("todos");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/supervisor/visitas-tecnicas");
      const json = await res.json();
      if (json.success) setItems(json.data ?? []);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter === "todos" ? items : items.filter((v) => v.status === filter);

  return (
    <div className="flex flex-col gap-3 px-4 py-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Visitas Técnicas</h2>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          <Plus size={14} />
          Nueva
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {(["todos", "borrador", "en_curso", "completada"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400"
            }`}
          >
            {f === "todos" ? "Todas" : STATUS_CFG[f]?.label ?? f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-zinc-600" size={24} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={24} />}
          title="Sin visitas técnicas"
          description={filter === "todos" ? "Crea tu primera visita técnica." : undefined}
          compact
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((v) => {
            const cfg = STATUS_CFG[v.status] ?? { label: v.status, color: "text-zinc-400", icon: null };
            return (
              <button
                key={v.id}
                onClick={() => onSelect(v)}
                className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors text-left flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{v.account?.name ?? "Cuenta"}</p>
                  <span className={`flex items-center gap-1 text-[10px] font-medium ${cfg.color} flex-shrink-0`}>
                    {cfg.icon}
                    {cfg.label}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 truncate">{v.installation?.name ?? "—"}</p>
                <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                  <span>{new Date(v.createdAt).toLocaleDateString("es-CL")}</span>
                  {v.durationMinutes && (
                    <span className="flex items-center gap-0.5">
                      <Clock size={10} />
                      {v.durationMinutes} min
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
