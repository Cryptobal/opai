"use client";

import { useState } from "react";

type Plan = "all" | "starter" | "pro" | "suite";

interface Module {
  name: string;
  description: string;
  icon: string;
  plan: "starter" | "pro" | "suite";
}

const MODULES: Module[] = [
  // Starter
  { name: "Gestión de Guardias", description: "Fichas OS10, contratos digitales, documentos, estructura de personal", icon: "🛡️", plan: "starter" },
  { name: "Pautas y Turnos", description: "Planificación mensual drag & drop, cobertura por puesto", icon: "📅", plan: "starter" },
  { name: "Marcaciones GPS", description: "Check-in/out con geolocalización y foto. Sin llamadas, sin dudas", icon: "📍", plan: "starter" },
  { name: "Portal del Guardia", description: "App iOS y Android. Marcaciones, documentos, liquidaciones, chat", icon: "📱", plan: "starter" },
  { name: "Alertas de Cobertura", description: "WhatsApp automático cuando falta un guardia. Reemplazos en minutos", icon: "🔔", plan: "starter" },
  { name: "Chat + Documentos", description: "Comunicación interna, protocolos digitales, firma electrónica", icon: "💬", plan: "starter" },
  // Pro
  { name: "Rondas GPS", description: "Checkpoints QR/GPS, monitoreo IA, evidencia fotográfica, informes automáticos", icon: "🔁", plan: "pro" },
  { name: "Supervisión de Campo", description: "Visitas técnicas, hallazgos con foto, checklists, evaluación de guardias", icon: "🔍", plan: "pro" },
  { name: "Portal del Cliente", description: "Visibilidad 24/7: guardias activos, rondas, incidentes, documentos", icon: "🖥️", plan: "pro" },
  { name: "Portal del Supervisor", description: "App de campo: visitas, equipo, novedades en tiempo real", icon: "👔", plan: "pro" },
  { name: "CRM + Cotizaciones", description: "Pipeline de ventas, propuestas PDF, contratos digitales", icon: "💼", plan: "pro" },
  { name: "Inventario", description: "Equipamiento, activos, uniformes y líneas móviles por guardia", icon: "📦", plan: "pro" },
  // Suite
  { name: "Payroll Chile", description: "Liquidaciones automáticas según LRE, anticipos, bonos, exportación DT", icon: "💰", plan: "suite" },
  { name: "Finanzas + Facturación", description: "DTE electrónico SII, contabilidad, bancos Fintoc, conciliación", icon: "🧾", plan: "suite" },
  { name: "Fiscalización DT", description: "Portal inspector laboral con datos verificables, hash auditables", icon: "🏛️", plan: "suite" },
  { name: "Gamificación", description: "Rankings, badges, desafíos y beneficios para retener guardias", icon: "🏆", plan: "suite" },
  { name: "IA Avanzada", description: "Análisis de patrones, predicción de ausentismo, alertas proactivas", icon: "🤖", plan: "suite" },
];

const PLAN_LABELS: Record<Plan, string> = {
  all: "Todos",
  starter: "Starter",
  pro: "Ops Pro",
  suite: "Suite",
};

const PLAN_COLORS: Record<string, string> = {
  starter: "#00D4AA",
  pro: "#3B82F6",
  suite: "#A855F7",
};

const PLAN_BADGE_BG: Record<string, string> = {
  starter: "bg-[#00D4AA]/10 text-[#00D4AA]",
  pro: "bg-status-info-soft text-status-info-fg",
  suite: "bg-purple-500/10 text-purple-400",
};

export default function ModulesSection() {
  const [filter, setFilter] = useState<Plan>("all");

  const filtered =
    filter === "all"
      ? MODULES
      : MODULES.filter((m) => m.plan === filter);

  return (
    <section id="modulos" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Sistema de Control de Rondas para Guardias de Seguridad
          </h2>
          <p className="text-lg text-[#94A3B8] max-w-2xl mx-auto">
            17 módulos diseñados exclusivamente para la seguridad privada.
            Cada plan incluye lo que necesitas para crecer.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex gap-1 p-1 rounded-xl bg-[#141E30]/60 border border-white/[0.07]">
            {(Object.keys(PLAN_LABELS) as Plan[]).map((plan) => (
              <button
                key={plan}
                onClick={() => setFilter(plan)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  filter === plan
                    ? "bg-[#00D4AA] text-[#0B1120]"
                    : "text-[#94A3B8] hover:text-white"
                }`}
              >
                {PLAN_LABELS[plan]}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((mod) => (
            <div
              key={mod.name}
              className="group rounded-xl border border-white/[0.07] bg-[#141E30]/30 p-5 transition-all hover:border-white/10 hover:bg-[#141E30]/50"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{mod.icon}</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${PLAN_BADGE_BG[mod.plan]}`}>
                  {mod.plan === "starter" ? "Starter" : mod.plan === "pro" ? "Ops Pro" : "Suite"}
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">{mod.name}</h3>
              <p className="text-sm text-[#94A3B8] leading-relaxed">{mod.description}</p>
              {/* Accent line */}
              <div
                className="mt-4 h-0.5 w-8 rounded-full opacity-40 group-hover:opacity-100 group-hover:w-12 transition-all"
                style={{ backgroundColor: PLAN_COLORS[mod.plan] }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
