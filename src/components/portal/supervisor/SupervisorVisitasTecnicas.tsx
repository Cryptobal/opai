"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList, Plus, Loader2, MapPin, Clock, CheckCircle2, FileEdit, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/opai/EmptyState";
import { SupervisorInstallation } from "@/lib/portal-supervisor";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

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
  initialFilter?: "todos" | "programada" | "borrador" | "en_curso" | "completada";
  autoOpenFirstPending?: boolean;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  programada: { label: "Por realizar", color: "text-orange-400", icon: <Clock size={12} /> },
  borrador: { label: "Borrador", color: "text-zinc-400", icon: <FileEdit size={12} /> },
  en_curso: { label: "En curso", color: "text-blue-400", icon: <MapPin size={12} /> },
  completada: { label: "Completada", color: "text-emerald-400", icon: <CheckCircle2 size={12} /> },
};

export function SupervisorVisitasTecnicas({ installations, onNew, onSelect, initialFilter = "todos", autoOpenFirstPending }: Props) {
  const [items, setItems] = useState<VisitaTecnica[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"todos" | "programada" | "borrador" | "en_curso" | "completada">(initialFilter);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const pendientes = items.filter((v) => v.status === "programada");
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!autoOpenFirstPending || loading || pendientes.length !== 1 || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    onSelect(pendientes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenFirstPending, loading, pendientes.length, pendientes[0]?.id]);

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

  const pendientesCount = items.filter((v) => v.status === "programada").length;

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
        {(["todos", "programada", "borrador", "en_curso", "completada"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-zinc-900 border border-zinc-800 text-zinc-400"
            }`}
          >
            {f === "todos" ? "Todas" : f === "programada" ? (
              <span className="flex items-center gap-1">
                Por realizar
                {pendientesCount > 0 && (
                  <span className="rounded-full bg-orange-500/20 text-orange-400 text-[9px] font-bold px-1.5 py-0.5">
                    {pendientesCount}
                  </span>
                )}
              </span>
            ) : STATUS_CFG[f]?.label ?? f}
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
            const isProgramada = v.status === "programada";
            const scheduledDate = (v as unknown as { scheduledAt?: string }).scheduledAt;
            return (
              <div
                key={v.id}
                className={`p-4 rounded-xl border transition-colors flex flex-col gap-1.5 ${
                  isProgramada
                    ? "bg-orange-950/30 border-orange-800/40"
                    : "bg-zinc-900 border-zinc-800"
                }`}
              >
                <button
                  onClick={() => onSelect(v)}
                  className="text-left flex flex-col gap-1.5 flex-1"
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
                    {isProgramada && scheduledDate ? (
                      <span className="text-orange-400 font-medium">
                        📅 {new Date(scheduledDate).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })}
                        {" · "}
                        {new Date(scheduledDate).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    ) : (
                      <span>{new Date(v.createdAt).toLocaleDateString("es-CL")}</span>
                    )}
                    {v.durationMinutes && (
                      <span className="flex items-center gap-0.5">
                        <Clock size={10} />
                        {v.durationMinutes} min
                      </span>
                    )}
                  </div>
                </button>
                {isProgramada && (
                  <button
                    onClick={() => onSelect(v)}
                    className="mt-1 w-full py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-600 transition-colors text-center"
                  >
                    Iniciar visita técnica
                  </button>
                )}
                {(v.status === "borrador" || v.status === "en_curso") && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteId(v.id);
                    }}
                    className="mt-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-800/50 text-red-400 text-xs font-medium hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 size={12} />
                    Eliminar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Eliminar visita"
        description="No puedes dejar visitas en borrador. Esta visita se eliminará. ¿Continuar?"
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (!deleteId) return;
          setDeleting(true);
          try {
            const res = await fetch(`/api/portal/supervisor/visitas-tecnicas/${deleteId}`, { method: "DELETE" });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Error al eliminar");
            setItems((prev) => prev.filter((x) => x.id !== deleteId));
            setDeleteId(null);
            toast.success("Visita eliminada");
          } catch (err) {
            console.error(err);
            toast.error("No se pudo eliminar");
          } finally {
            setDeleting(false);
          }
        }}
        variant="destructive"
        loading={deleting}
        loadingLabel="Eliminando..."
      />
    </div>
  );
}
