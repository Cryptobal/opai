"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const INDUSTRY_OPTIONS = [
  { value: "condominio", label: "Condominio" },
  { value: "construccion", label: "Construcción" },
  { value: "logistica", label: "Logística" },
  { value: "retail", label: "Retail" },
  { value: "industrial", label: "Industrial" },
  { value: "educacion", label: "Educación" },
  { value: "salud", label: "Salud" },
  { value: "otro", label: "Otro" },
];

const GUARD_OPTIONS = [
  { value: "1-5", label: "1 a 5" },
  { value: "6-15", label: "6 a 15" },
  { value: "16-30", label: "16 a 30" },
  { value: "30+", label: "Más de 30" },
];

interface RegistroDemoFormProps {
  utmSource: string;
  utmCampaign: string;
}

export function RegistroDemoForm({ utmSource, utmCampaign }: RegistroDemoFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    industry: "",
    estimatedGuards: "",
  });

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    // Client-side validation
    if (!form.companyName.trim()) return setError("Ingrese el nombre de la empresa");
    if (!form.contactName.trim()) return setError("Ingrese su nombre");
    if (!form.email.trim()) return setError("Ingrese su email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Ingrese un email válido");
    if (!form.industry) return setError("Seleccione un rubro");

    setLoading(true);

    try {
      // Get honeypot value
      const honeypot = (document.getElementById("website_url") as HTMLInputElement)?.value || "";

      const res = await fetch("/api/public/registro-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          estimatedGuards: form.estimatedGuards || undefined,
          website_url: honeypot,
          utmSource,
          utmCampaign,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al registrarse. Intente nuevamente.");
        setLoading(false);
        return;
      }

      router.push("/registro-demo/confirmacion");
    } catch {
      setError("Error de conexión. Intente nuevamente.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-[#0a1628] p-6 sm:p-8 space-y-5">
        {/* Company Name */}
        <div>
          <label htmlFor="companyName" className="block text-sm font-medium text-slate-300 mb-1.5">
            Nombre de la empresa <span className="text-red-400">*</span>
          </label>
          <input
            id="companyName"
            type="text"
            value={form.companyName}
            onChange={(e) => updateField("companyName", e.target.value)}
            placeholder="Ej: Torres del Pacífico"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors"
            autoComplete="organization"
          />
        </div>

        {/* Contact Name */}
        <div>
          <label htmlFor="contactName" className="block text-sm font-medium text-slate-300 mb-1.5">
            Nombre del contacto <span className="text-red-400">*</span>
          </label>
          <input
            id="contactName"
            type="text"
            value={form.contactName}
            onChange={(e) => updateField("contactName", e.target.value)}
            placeholder="Ej: Juan Pérez"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors"
            autoComplete="name"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
            Email corporativo <span className="text-red-400">*</span>
          </label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="juan@empresa.cl"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors"
            autoComplete="email"
          />
        </div>

        {/* Phone (optional) */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-1.5">
            Teléfono <span className="text-slate-600">(opcional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="+56 9 1234 5678"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors"
            autoComplete="tel"
          />
        </div>

        {/* Industry + Guards row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Industry */}
          <div>
            <label htmlFor="industry" className="block text-sm font-medium text-slate-300 mb-1.5">
              Rubro <span className="text-red-400">*</span>
            </label>
            <select
              id="industry"
              value={form.industry}
              onChange={(e) => updateField("industry", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors appearance-none"
            >
              <option value="" className="bg-[#0a1628]">Seleccione...</option>
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#0a1628]">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Estimated Guards */}
          <div>
            <label htmlFor="estimatedGuards" className="block text-sm font-medium text-slate-300 mb-1.5">
              Guardias estimados <span className="text-slate-600">(opcional)</span>
            </label>
            <select
              id="estimatedGuards"
              value={form.estimatedGuards}
              onChange={(e) => updateField("estimatedGuards", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors appearance-none"
            >
              <option value="" className="bg-[#0a1628]">Seleccione...</option>
              {GUARD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#0a1628]">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Honeypot (hidden from humans) */}
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <input
            type="text"
            id="website_url"
            name="website_url"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Registrando...
          </span>
        ) : (
          "Acceder a la demo"
        )}
      </button>

      <p className="text-center text-xs text-slate-600">
        Sin compromiso · Sin tarjeta de crédito · Acceso inmediato
      </p>
    </form>
  );
}
