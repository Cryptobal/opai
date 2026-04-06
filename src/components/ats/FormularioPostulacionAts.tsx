"use client";

import { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  Shield,
  Car,
  Briefcase,
  User,
  Phone,
  Mail,
  CreditCard,
  MessageSquare,
  ExternalLink,
} from "lucide-react";

interface FormularioPostulacionAtsProps {
  jobPostingId: string;
  jobTitle: string;
  requiereOS10: boolean;
  requiereMovilizacion: boolean;
  tenantName: string;
}

interface FormData {
  firstName: string;
  lastName: string;
  rut: string;
  email: string;
  phoneMobile: string;
  tieneOS10: boolean;
  experienciaAnios: number;
  tieneMovilizacion: boolean;
  notas: string;
}

export function FormularioPostulacionAts({
  jobPostingId,
  jobTitle,
  requiereOS10,
  requiereMovilizacion,
  tenantName,
}: FormularioPostulacionAtsProps) {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    rut: "",
    email: "",
    phoneMobile: "",
    tieneOS10: false,
    experienciaAnios: 0,
    tieneMovilizacion: false,
    notas: "",
  });

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/public/ats/postular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobPostingId,
          ...form,
          experienciaAnios: Number(form.experienciaAnios),
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || "Error al enviar postulación");
      }
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  // Success state — modal inviting to portal
  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-emerald-400" />
        <h3 className="mb-2 text-2xl font-bold text-white">
          Postulación enviada
        </h3>
        <p className="mb-6 text-slate-300">
          Tu postulación a <span className="font-semibold text-white">{jobTitle}</span> en{" "}
          <span className="font-semibold text-white">{tenantName}</span> fue recibida correctamente.
          Te contactaremos pronto.
        </p>

        <div className="mx-auto max-w-md rounded-xl border border-slate-700 bg-slate-900/80 p-6 text-left">
          <h4 className="mb-3 text-lg font-semibold text-white">
            Accede al Portal del Guardia
          </h4>
          <p className="mb-4 text-sm text-slate-400">
            Ingresa al portal para ver el estado de tu postulación, explorar
            más ofertas y completar tu perfil profesional.
          </p>
          <ul className="mb-5 space-y-2 text-sm text-slate-300">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              Seguimiento en tiempo real de tus postulaciones
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              Acceso a más ofertas de empleo disponibles
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              Completa tu perfil para mejorar tu match
            </li>
          </ul>
          <a
            href="/portal/guardia"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-600"
          >
            Ir al Portal del Guardia
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  // CTA button (before form is shown)
  if (!showForm) {
    return (
      <div className="text-center">
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center rounded-lg bg-emerald-500 px-8 py-3 text-lg font-bold text-white transition-colors hover:bg-emerald-600"
        >
          Postular ahora
        </button>
      </div>
    );
  }

  // Application form
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 sm:p-8">
      <h3 className="mb-1 text-xl font-bold text-white">
        Postular a esta oferta
      </h3>
      <p className="mb-6 text-sm text-slate-400">
        Completa tus datos para postular. No necesitas crear una cuenta.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300">
              <User className="h-4 w-4 text-slate-500" />
              Nombre *
            </span>
            <input
              type="text"
              required
              maxLength={100}
              value={form.firstName}
              onChange={(e) => updateField("firstName", e.target.value)}
              placeholder="Juan"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300">
              <User className="h-4 w-4 text-slate-500" />
              Apellido *
            </span>
            <input
              type="text"
              required
              maxLength={100}
              value={form.lastName}
              onChange={(e) => updateField("lastName", e.target.value)}
              placeholder="Pérez"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
        </div>

        {/* RUT */}
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300">
            <CreditCard className="h-4 w-4 text-slate-500" />
            RUT *
          </span>
          <input
            type="text"
            required
            value={form.rut}
            onChange={(e) => updateField("rut", e.target.value)}
            placeholder="12345678-9"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </label>

        {/* Contact row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300">
              <Mail className="h-4 w-4 text-slate-500" />
              Email *
            </span>
            <input
              type="email"
              required
              maxLength={200}
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="juan@email.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300">
              <Phone className="h-4 w-4 text-slate-500" />
              Celular *
            </span>
            <input
              type="tel"
              required
              value={form.phoneMobile}
              onChange={(e) => updateField("phoneMobile", e.target.value)}
              placeholder="912345678"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
        </div>

        {/* Experience */}
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300">
            <Briefcase className="h-4 w-4 text-slate-500" />
            Años de experiencia en seguridad
          </span>
          <select
            value={form.experienciaAnios}
            onChange={(e) => updateField("experienciaAnios", Number(e.target.value))}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value={0}>Sin experiencia</option>
            <option value={1}>1 año</option>
            <option value={2}>2 años</option>
            <option value={3}>3 años</option>
            <option value={5}>5+ años</option>
            <option value={10}>10+ años</option>
          </select>
        </label>

        {/* Toggles row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.tieneOS10}
              onChange={(e) => updateField("tieneOS10", e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400" />
              <div>
                <span className="text-sm font-medium text-white">Tengo OS10</span>
                {requiereOS10 && (
                  <span className="ml-2 text-xs text-amber-400">(requerido)</span>
                )}
              </div>
            </div>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.tieneMovilizacion}
              onChange={(e) => updateField("tieneMovilizacion", e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-slate-400" />
              <div>
                <span className="text-sm font-medium text-white">Tengo movilización</span>
                {requiereMovilizacion && (
                  <span className="ml-2 text-xs text-amber-400">(requerido)</span>
                )}
              </div>
            </div>
          </label>
        </div>

        {/* Notes */}
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            Mensaje adicional <span className="text-slate-500">(opcional)</span>
          </span>
          <textarea
            maxLength={1000}
            rows={3}
            value={form.notas}
            onChange={(e) => updateField("notas", e.target.value)}
            placeholder="Cuéntanos sobre tu experiencia o disponibilidad..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </label>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-base font-bold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar postulación"
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="rounded-lg px-4 py-3 text-sm text-slate-400 transition-colors hover:text-white"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
