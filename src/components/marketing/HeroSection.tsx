"use client";

import { useEffect, useState } from "react";

const STATS = [
  { value: "5,000+", label: "Guardias activos" },
  { value: "99.8%", label: "Cobertura operacional" },
  { value: "8+", label: "Años en la industria" },
];

export default function HeroSection() {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(true), []);

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#06080F] via-[#0B1120] to-[#0B1120]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#00D4AA]/5 rounded-full blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
        <div
          className={`max-w-4xl mx-auto text-center transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#00D4AA]/20 bg-[#00D4AA]/5 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#00D4AA] animate-pulse" />
            <span className="text-xs font-medium text-[#00D4AA]">
              ERP para Seguridad Privada con IA
            </span>
          </div>

          {/* H1 */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1] mb-6">
            Deja de administrar la operación.{" "}
            <span className="text-[#00D4AA]">Dedícate a proteger.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-[#94A3B8] max-w-3xl mx-auto mb-10 leading-relaxed">
            Las empresas de seguridad privada en Chile pierden horas cada día
            controlando quién llegó, quién faltó, qué ronda se completó y qué
            guardia va de reemplazo. OPAI converge todo en un solo sistema con
            inteligencia artificial — para que tu equipo se concentre en lo que
            importa: proteger a tus clientes.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a
              href="#demo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold bg-[#00D4AA] hover:bg-[#00B894] text-[#0B1120] rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Solicitar demo gratis
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 8h10m-4-4 4 4-4 4" />
              </svg>
            </a>
            <a
              href="#modulos"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-medium text-white border border-white/10 hover:border-white/20 rounded-xl transition-all hover:bg-white/5"
            >
              Ver cómo funciona
            </a>
          </div>

          {/* Dashboard mock */}
          <div className="relative mx-auto max-w-3xl">
            <div className="relative rounded-xl overflow-hidden border border-white/[0.07] bg-[#141E30]/60 backdrop-blur shadow-2xl shadow-[#00D4AA]/5">
              {/* Top bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07] bg-[#0B1120]/80">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/40" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
                  <div className="w-3 h-3 rounded-full bg-green-500/40" />
                </div>
                <div className="flex-1 text-center text-xs text-[#94A3B8] font-mono">
                  opai.cl/ops/dashboard
                </div>
              </div>
              {/* Mock content */}
              <div className="p-6 space-y-4">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Guardias activos", value: "127", color: "#00D4AA" },
                    { label: "Cobertura hoy", value: "98.4%", color: "#00D4AA" },
                    { label: "Alertas resueltas", value: "3/3", color: "#00D4AA" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg border border-white/[0.07] bg-[#0B1120]/50 p-3"
                    >
                      <div className="text-xs text-[#94A3B8] mb-1">{stat.label}</div>
                      <div className="text-xl font-bold" style={{ color: stat.color }}>
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Activity rows */}
                <div className="space-y-2">
                  {[
                    { time: "08:02", text: "Carlos Muñoz marcó entrada — Mall Plaza Sur", type: "ok" },
                    { time: "08:05", text: "Ronda nocturna completada — Edificio Central", type: "ok" },
                    { time: "08:12", text: "Alerta: Guardia sin marcar — Parque Industrial", type: "alert" },
                  ].map((row) => (
                    <div
                      key={row.time}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                    >
                      <span className="font-mono text-xs text-[#94A3B8]">{row.time}</span>
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          row.type === "alert" ? "bg-amber-400" : "bg-[#00D4AA]"
                        }`}
                      />
                      <span className="text-sm text-[#E2E8F0]">{row.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Floating alert card */}
            <div className="absolute -right-4 top-1/2 -translate-y-1/2 translate-x-1/2 hidden lg:block">
              <div className="bg-[#141E30] border border-[#00D4AA]/20 rounded-lg p-3 shadow-xl shadow-black/40 w-52">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-xs font-semibold text-amber-400">Alerta cobertura</span>
                </div>
                <p className="text-xs text-[#94A3B8]">
                  Puesto #4 sin guardia. WhatsApp enviado a 3 reemplazos disponibles.
                </p>
              </div>
            </div>
          </div>

          {/* Social proof stats */}
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-xs sm:text-sm text-[#94A3B8] mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
