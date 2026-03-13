"use client";

import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, XCircle, Shield } from "lucide-react";

interface MarcacionInfo {
  tipo: string;
  timestampOriginal: string;
  timestampNuevo: string;
  motivo: string | null;
  modifiedAt: string | null;
  vencido: boolean;
  yaOpuesta: boolean;
  consolidada: boolean;
  guardiaName: string;
  installationName: string;
}

export function OpposicionMarcacionForm({ token }: { token: string }) {
  const [info, setInfo] = useState<MarcacionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rut, setRut] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    fetch(`/api/marcacion/oposicion/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setInfo(d.data);
        else setError(d.error);
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/marcacion/oposicion/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut, motivo: reason }),
      });
      const d = await r.json();
      if (d.success) {
        setSubmitted(true);
        setRestored(d.restored);
      } else {
        setError(d.error);
      }
    } catch {
      setError("Error al enviar. Intente nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-slate-500 text-sm">Cargando información...</p>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Link inválido</h2>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Oposición registrada</h2>
        <p className="text-slate-500 text-sm">
          {restored
            ? "Tu marcación original fue restaurada correctamente."
            : "Tu oposición fue registrada. Un supervisor la revisará."}
        </p>
      </div>
    );
  }

  if (!info) return null;

  if (info.vencido || info.consolidada) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Plazo vencido</h2>
        <p className="text-slate-500 text-sm">
          El plazo de 48 horas para oponerse ya venció. La modificación fue consolidada.
        </p>
      </div>
    );
  }

  if (info.yaOpuesta) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Ya opusiste</h2>
        <p className="text-slate-500 text-sm">Ya registraste tu oposición previamente.</p>
      </div>
    );
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("es-CL", {
      timeZone: "America/Santiago",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="bg-white rounded-xl shadow">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center gap-3 mb-1">
          <Shield className="w-5 h-5 text-red-500" />
          <h1 className="text-lg font-semibold text-slate-800">Oposición a Modificación</h1>
        </div>
        <p className="text-sm text-slate-500">Res. Exenta N°38 — DT Chile</p>
      </div>

      <div className="p-6 space-y-4">
        <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Trabajador</span>
            <span className="font-medium">{info.guardiaName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Instalación</span>
            <span className="font-medium">{info.installationName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Tipo</span>
            <span>{info.tipo === "entrada" ? "Entrada" : "Salida"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Marca original</span>
            <span className="text-red-500 line-through">{fmtDate(info.timestampOriginal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Nueva marca</span>
            <span className="font-semibold text-amber-600">{fmtDate(info.timestampNuevo)}</span>
          </div>
          {info.motivo && (
            <div className="flex justify-between">
              <span className="text-slate-500">Motivo mod.</span>
              <span className="text-right max-w-[60%]">{info.motivo}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Su RUT <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={rut}
              onChange={(e) => setRut(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="12.345.678-9"
              required
              minLength={7}
            />
            <p className="text-xs text-slate-400 mt-1">Ingrese su RUT para verificar su identidad</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Motivo de su oposición <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              placeholder="Explique por qué no está de acuerdo con esta modificación..."
              required
              minLength={5}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || reason.trim().length < 5 || rut.trim().length < 7}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg text-sm transition-colors"
          >
            {submitting ? "Enviando..." : "Registrar Oposición"}
          </button>
        </form>
      </div>
    </div>
  );
}
