"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface Guard {
  id: string;
  firstName: string;
  lastName: string;
}

interface Props {
  installations: SupervisorInstallation[];
  onBack: () => void;
  onCreated: () => void;
}

export function SupervisorCrearTE({ installations, onBack, onCreated }: Props) {
  const [installationId, setInstallationId] = useState(installations[0]?.id ?? "");
  const [guards, setGuards] = useState<Guard[]>([]);
  const [guardiaId, setGuardiaId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState<"turno_extra" | "hora_extra">("turno_extra");
  const [horasExtra, setHorasExtra] = useState("2");
  const [loadingGuards, setLoadingGuards] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!installationId) return;
    setLoadingGuards(true);
    setGuardiaId("");
    fetch(`/api/portal/supervisor/mi-equipo?installationId=${installationId}`)
      .then((r) => r.json())
      .then((json) => {
        const group = (json.data ?? []).find(
          (g: { installationId: string }) => g.installationId === installationId
        );
        setGuards(group?.guards ?? []);
      })
      .catch(() => setGuards([]))
      .finally(() => setLoadingGuards(false));
  }, [installationId]);

  async function handleSubmit() {
    if (!installationId || !guardiaId || !date) {
      toast.error("Completa todos los campos requeridos.");
      return;
    }
    setSubmitting(true);
    try {
      // /api/te = registro directo de persona en TE (sin flujo de aprobación)
      const res = await fetch("/api/te", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          guardiaId,
          date,
          tipo,
          horasExtra: tipo === "hora_extra" ? Number(horasExtra) : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Turno extra registrado");
        onCreated();
      } else {
        toast.error(json.error ?? "Error al registrar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold">Crear Turno Extra</h2>
      </div>

      {/* Instalación */}
      <Field label="Instalación *">
        <select
          value={installationId}
          onChange={(e) => setInstallationId(e.target.value)}
          className="select-field"
        >
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </Field>

      {/* Guardia */}
      <Field label="Guardia *">
        {loadingGuards ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm py-2">
            <Loader2 size={14} className="animate-spin" /> Cargando guardias...
          </div>
        ) : (
          <select
            value={guardiaId}
            onChange={(e) => setGuardiaId(e.target.value)}
            className="select-field"
          >
            <option value="">Seleccionar guardia</option>
            {guards.map((g) => (
              <option key={g.id} value={g.id}>
                {g.firstName} {g.lastName}
              </option>
            ))}
          </select>
        )}
      </Field>

      {/* Fecha */}
      <Field label="Fecha *">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input-field"
        />
      </Field>

      {/* Tipo */}
      <Field label="Tipo">
        <div className="flex gap-2">
          {(["turno_extra", "hora_extra"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                tipo === t
                  ? "bg-purple-600 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400"
              }`}
            >
              {t === "turno_extra" ? "Turno extra" : "Horas extra"}
            </button>
          ))}
        </div>
      </Field>

      {tipo === "hora_extra" && (
        <Field label="Horas extra">
          <input
            type="number"
            min="1"
            max="12"
            value={horasExtra}
            onChange={(e) => setHorasExtra(e.target.value)}
            className="input-field"
          />
        </Field>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !guardiaId}
        className="flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-600 text-white font-medium text-sm hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {submitting ? "Creando..." : "Crear Turno Extra"}
      </button>

      <style jsx>{`
        .select-field {
          width: 100%;
          background: rgb(24 24 27);
          border: 1px solid rgb(39 39 42);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          color: white;
          outline: none;
        }
        .select-field:focus { border-color: rgb(147 51 234); }
        .input-field {
          width: 100%;
          background: rgb(24 24 27);
          border: 1px solid rgb(39 39 42);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          color: white;
          outline: none;
        }
        .input-field:focus { border-color: rgb(147 51 234); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      {children}
    </div>
  );
}
