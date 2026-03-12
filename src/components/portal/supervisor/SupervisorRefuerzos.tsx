"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/opai/EmptyState";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface Refuerzo {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
  guardsCount: number;
  shiftType: string | null;
  rateClp: number | null;
  estimatedTotalClp: number;
  installation: { id: string; name: string } | null;
  guardia: { persona: { firstName: string; lastName: string } };
}

interface Props {
  installations: SupervisorInstallation[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pendiente_aprobacion: { label: "Pendiente", color: "text-amber-400" },
  solicitado: { label: "Solicitado", color: "text-blue-400" },
  en_curso: { label: "En curso", color: "text-emerald-400" },
  realizado: { label: "Realizado", color: "text-zinc-400" },
  rechazado: { label: "Rechazado", color: "text-red-400" },
};

export function SupervisorRefuerzos({ installations }: Props) {
  const [items, setItems] = useState<Refuerzo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [formInstallId, setFormInstallId] = useState(installations[0]?.id ?? "");
  const [guards, setGuards] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [guardiaId, setGuardiaId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [guardsCount, setGuardsCount] = useState("1");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    fetch("/api/portal/supervisor/guardias")
      .then((r) => r.json())
      .then((json) => setGuards(json.data ?? []))
      .catch(() => setGuards([]));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/refuerzos");
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

  async function handleCreate() {
    if (!formInstallId || !guardiaId || !startAt || !endAt) {
      toast.error("Completa todos los campos requeridos.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ops/refuerzos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId: formInstallId,
          guardiaId,
          startAt,
          endAt,
          guardsCount: Number(guardsCount),
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Refuerzo solicitado");
        setShowCreate(false);
        await load();
      } else {
        toast.error(json.error ?? "Error");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Refuerzos</h2>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-700 text-white text-sm font-medium hover:bg-red-600 transition-colors"
        >
          <Plus size={14} />
          Solicitar
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
          <p className="text-sm font-medium text-zinc-200">Nueva solicitud de refuerzo</p>

          <FormRow label="Instalación">
            <select
              value={formInstallId}
              onChange={(e) => setFormInstallId(e.target.value)}
              className="mobile-select"
            >
              {installations.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Guardia">
            <select
              value={guardiaId}
              onChange={(e) => setGuardiaId(e.target.value)}
              className="mobile-select"
            >
              <option value="">Seleccionar guardia</option>
              {guards.map((g) => (
                <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>
              ))}
            </select>
          </FormRow>

          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Inicio">
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="mobile-input"
              />
            </FormRow>
            <FormRow label="Fin">
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="mobile-input"
              />
            </FormRow>
          </div>

          <FormRow label="Guardias necesarios">
            <input
              type="number"
              min="1"
              value={guardsCount}
              onChange={(e) => setGuardsCount(e.target.value)}
              className="mobile-input"
            />
          </FormRow>

          <FormRow label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mobile-input resize-none"
              placeholder="Motivo del refuerzo..."
            />
          </FormRow>

          <button
            onClick={handleCreate}
            disabled={submitting}
            className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-700 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Enviar solicitud
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-zinc-600" size={24} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<AlertTriangle size={24} />} title="Sin refuerzos" compact />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((r) => {
            const cfg = STATUS_LABELS[r.status] ?? { label: r.status, color: "text-zinc-400" };
            return (
              <div
                key={r.id}
                className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {r.guardia.persona.firstName} {r.guardia.persona.lastName}
                  </p>
                  <span className={`text-[10px] ${cfg.color}`}>{cfg.label}</span>
                </div>
                <p className="text-xs text-zinc-500">{r.installation?.name ?? "—"}</p>
                <p className="text-xs text-zinc-600">
                  {new Date(r.startAt).toLocaleDateString("es-CL")} →{" "}
                  {new Date(r.endAt).toLocaleDateString("es-CL")} ·{" "}
                  {r.guardsCount} guardia{r.guardsCount !== 1 ? "s" : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .mobile-select, .mobile-input {
          width: 100%;
          background: rgb(9 9 11);
          border: 1px solid rgb(39 39 42);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          color: white;
          outline: none;
        }
        .mobile-select:focus, .mobile-input:focus { border-color: rgb(185 28 28); }
      `}</style>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-zinc-500">{label}</label>
      {children}
    </div>
  );
}
