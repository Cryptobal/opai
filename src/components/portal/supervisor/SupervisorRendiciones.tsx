"use client";

import { useEffect, useState } from "react";
import { Receipt, Plus, Loader2, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/opai/EmptyState";

interface Rendicion {
  id: string;
  code: string;
  type: string;
  status: string;
  amount: number;
  date: string;
  description: string | null;
}

type Tab = "borrador" | "enviadas" | "aprobadas" | "todas";

interface Props {
  adminId: string;
  onCreateRendicion: () => void;
}

// @ds-allow-legacy: este componente usa color/bg tokens propios del portal supervisor
// (distintos a los semánticos de DS v3). Mantener override local; las etiquetas siguen
// siendo las mismas que en `@/lib/finance/rendicion-status`.
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Borrador", color: "text-zinc-400", bg: "bg-zinc-700/30" },
  SUBMITTED: { label: "Enviada", color: "text-blue-400", bg: "bg-blue-500/15" },
  IN_APPROVAL: { label: "En aprobación", color: "text-amber-400", bg: "bg-amber-500/15" },
  APPROVED: { label: "Aprobada", color: "text-emerald-400", bg: "bg-emerald-500/15" },
  REJECTED: { label: "Rechazada", color: "text-red-400", bg: "bg-red-500/15" },
  PAID: { label: "Pagada", color: "text-emerald-400", bg: "bg-emerald-500/15" },
};

export function SupervisorRendiciones({ adminId, onCreateRendicion }: Props) {
  const [items, setItems] = useState<Rendicion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("borrador");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/finance/rendiciones?submitterId=${adminId}`);
        if (res.ok) {
          const json = await res.json();
          setItems(json.data ?? []);
        }
      } catch {
        // noop
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [adminId]);

  const filtered = items.filter((r) => {
    if (tab === "borrador") return r.status === "DRAFT";
    if (tab === "enviadas") return r.status === "SUBMITTED" || r.status === "IN_APPROVAL";
    if (tab === "aprobadas") return r.status === "APPROVED" || r.status === "PAID";
    return true;
  });

  const draftCount = items.filter((r) => r.status === "DRAFT").length;

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "borrador", label: "Borrador" },
    { id: "enviadas", label: "Enviadas" },
    { id: "aprobadas", label: "Aprobadas" },
    { id: "todas", label: "Todas" },
  ];

  return (
    <div className="flex flex-col gap-3 px-4 py-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rendiciones</h2>
        <button
          onClick={onCreateRendicion}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors"
        >
          <Plus size={14} />
          Nueva
        </button>
      </div>

      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 overflow-x-auto">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-shrink-0 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
              tab === id ? "bg-zinc-700 text-white" : "text-zinc-500"
            }`}
          >
            {label}
            {id === "borrador" && draftCount > 0 && (
              <span className="ml-1 bg-amber-500 text-white text-[10px] px-1.5 rounded-full">
                {draftCount}
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
        <EmptyState
          icon={<Receipt size={24} />}
          title="Sin rendiciones"
          description={tab === "borrador" ? "Crea una nueva rendición." : undefined}
          action={
            tab === "borrador" ? (
              <button
                onClick={onCreateRendicion}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium"
              >
                Crear rendición
              </button>
            ) : undefined
          }
          compact
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((r) => {
            const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.DRAFT;
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                  <Receipt size={16} className="text-zinc-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{r.code}</p>
                    <span className="text-xs text-zinc-500">
                      {r.type === "PURCHASE" ? "Compra" : "Kilometraje"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate">
                    {r.description ?? "Sin descripción"}
                  </p>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {new Date(r.date).toLocaleDateString("es-CL")} ·{" "}
                    ${r.amount.toLocaleString("es-CL")}
                  </p>
                </div>
                <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
