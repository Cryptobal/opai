"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Plus, UserPlus, CheckCircle2, XCircle, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/opai/EmptyState";

interface TE {
  id: string;
  date: string;
  status: string;
  tipo: string;
  horasExtra: number | null;
  amountClp: number;
  installationName: string;
  guardiaName: string;
}

type Tab = "pendientes" | "aprobados" | "rechazados";

interface Props {
  onCreateTE: () => void;
  onIngresoTE?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  paid: "Pagado",
};

export function SupervisorTurnosExtra({ onCreateTE, onIngresoTE }: Props) {
  const [items, setItems] = useState<TE[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pendientes");
  const [actioning, setActioning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/supervisor/turnos-extra");
      if (res.ok) {
        const json = await res.json();
        setItems(json.data ?? []);
      }
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id: string, action: "approve" | "reject") {
    setActioning(id);
    try {
      const res = await fetch(`/api/portal/supervisor/turnos-extra/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(action === "approve" ? "Turno aprobado" : "Turno rechazado");
        await load();
      } else {
        toast.error(json.error ?? "Error");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setActioning(null);
    }
  }

  const filtered = items.filter((t) => {
    if (tab === "pendientes") return t.status === "pending";
    if (tab === "aprobados") return t.status === "approved" || t.status === "paid";
    if (tab === "rechazados") return t.status === "rejected";
    return true;
  });

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "pendientes", label: "Pendientes" },
    { id: "aprobados", label: "Aprobados" },
    { id: "rechazados", label: "Rechazados" },
  ];

  return (
    <div className="flex flex-col gap-3 px-4 py-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Turnos Extra</h2>
        <div className="flex items-center gap-2">
          {onIngresoTE && (
            <button
              onClick={onIngresoTE}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 transition-colors"
            >
              <UserPlus size={14} />
              Persona nueva
            </button>
          )}
          <button
            onClick={onCreateTE}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-500 transition-colors"
          >
            <Plus size={14} />
            Crear TE
          </button>
        </div>
      </div>

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
            {id === "pendientes" && items.filter((t) => t.status === "pending").length > 0 && (
              <span className="ml-1 bg-purple-500 text-white text-[10px] px-1.5 rounded-full">
                {items.filter((t) => t.status === "pending").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-zinc-600" size={24} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Clock size={24} />} title="Sin turnos extra" compact />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((t) => (
            <TECard
              key={t.id}
              te={t}
              showActions={tab === "pendientes"}
              actioning={actioning === t.id}
              onApprove={() => handleAction(t.id, "approve")}
              onReject={() => handleAction(t.id, "reject")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TECard({
  te,
  showActions,
  actioning,
  onApprove,
  onReject,
}: {
  te: TE;
  showActions: boolean;
  actioning: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const dateStr = new Date(te.date).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
  });

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
          <Clock size={18} className="text-purple-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{te.guardiaName}</p>
          <p className="text-xs text-zinc-500 truncate">{te.installationName}</p>
          <p className="text-xs text-zinc-600 mt-0.5">
            {dateStr} ·{" "}
            {te.tipo === "hora_extra" ? `${te.horasExtra ?? "?"} hrs extra` : "Turno extra"}
            {te.amountClp > 0 &&
              ` · $${Number(te.amountClp).toLocaleString("es-CL")}`}
          </p>
        </div>
        <span
          className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full ${
            te.status === "approved" || te.status === "paid"
              ? "bg-emerald-500/15 text-emerald-400"
              : te.status === "rejected"
              ? "bg-red-500/15 text-red-400"
              : "bg-amber-500/15 text-amber-400"
          }`}
        >
          {STATUS_LABEL[te.status] ?? te.status}
        </span>
      </div>

      {showActions && (
        <div className="flex border-t border-zinc-800">
          <button
            onClick={onReject}
            disabled={actioning}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
          >
            <XCircle size={14} />
            Rechazar
          </button>
          <div className="w-px bg-zinc-800" />
          <button
            onClick={onApprove}
            disabled={actioning}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
          >
            {actioning ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Aprobar
          </button>
        </div>
      )}
    </div>
  );
}
