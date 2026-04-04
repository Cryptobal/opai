"use client";

import { useState, useEffect } from "react";

interface PlanData {
  name: string;
  price: number; // UF per guard/month
  description: string;
  guardLimit: string;
  popular?: boolean;
  features: string[];
  color: string;
}

const PLANS: PlanData[] = [
  {
    name: "Starter",
    price: 0.12,
    description: "Núcleo operacional",
    guardLimit: "Hasta 50 guardias",
    color: "#00D4AA",
    features: [
      "Fichas de guardias de seguridad",
      "Puestos y pautas mensuales",
      "Marcaciones GPS + foto",
      "Portal del Guardia (iOS + Android)",
      "Alertas de cobertura por WhatsApp",
      "Chat interno + documentos digitales",
      "Soporte por email",
    ],
  },
  {
    name: "Operaciones Pro",
    price: 0.28,
    description: "Operación completa",
    guardLimit: "Hasta 200 guardias",
    popular: true,
    color: "#3B82F6",
    features: [
      "Todo Starter +",
      "Sistema de Control de Rondas GPS",
      "Supervisión de campo",
      "Portal del Cliente (visibilidad 24/7)",
      "Portal del Supervisor",
      "CRM + Cotizaciones",
      "Inventario y activos",
      "Control de turno y refuerzos",
      "Soporte prioritario",
    ],
  },
  {
    name: "Suite Completa",
    price: 0.46,
    description: "Todo incluido",
    guardLimit: "Guardias ilimitados",
    color: "#A855F7",
    features: [
      "Todo Operaciones Pro +",
      "Payroll Chile (liquidaciones LRE)",
      "Facturación electrónica SII",
      "Contabilidad + bancos (Fintoc)",
      "Fiscalización DT",
      "IA avanzada",
      "Onboarding dedicado + SLA",
    ],
  },
];

export default function PricingSection() {
  const [showCLP, setShowCLP] = useState(false);
  const [ufValue, setUfValue] = useState(38000);

  useEffect(() => {
    fetch("/api/public/uf")
      .then((r) => r.json())
      .then((d) => {
        if (d.uf) setUfValue(d.uf);
      })
      .catch(() => {});
  }, []);

  const formatCLP = (uf: number) =>
    Math.round(uf * ufValue).toLocaleString("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    });

  return (
    <section id="precios" className="relative py-24 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1120] via-[#06080F] to-[#0B1120]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Precios transparentes en UF
          </h2>
          <p className="text-lg text-[#94A3B8] max-w-2xl mx-auto mb-6">
            Por guardia activo/mes. Sin contratos de permanencia. 14 días de prueba
            con Suite completa gratis.
          </p>

          {/* Toggle UF / CLP */}
          <div className="inline-flex items-center gap-3 p-1 rounded-xl bg-[#141E30]/60 border border-white/[0.07]">
            <button
              onClick={() => setShowCLP(false)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                !showCLP ? "bg-[#00D4AA] text-[#0B1120]" : "text-[#94A3B8] hover:text-white"
              }`}
            >
              UF
            </button>
            <button
              onClick={() => setShowCLP(true)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                showCLP ? "bg-[#00D4AA] text-[#0B1120]" : "text-[#94A3B8] hover:text-white"
              }`}
            >
              CLP
            </button>
          </div>
          {showCLP && (
            <p className="text-xs text-[#94A3B8] mt-2">
              1 UF = {ufValue.toLocaleString("es-CL")} CLP (Banco Central, hoy)
            </p>
          )}
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-6 sm:p-8 transition-all ${
                plan.popular
                  ? "border-blue-500/30 bg-[#141E30]/60 scale-[1.02] shadow-xl shadow-blue-500/5"
                  : "border-white/[0.07] bg-[#141E30]/30"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Más popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                <p className="text-sm text-[#94A3B8]">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold text-white">
                    {showCLP ? formatCLP(plan.price) : `${plan.price} UF`}
                  </span>
                </div>
                <p className="text-sm text-[#94A3B8] mt-1">
                  por guardia/mes · {plan.guardLimit}
                </p>
              </div>

              {/* CTA */}
              <a
                href="#demo"
                className={`block w-full text-center py-3 rounded-xl text-sm font-semibold transition-all mb-6 ${
                  plan.popular
                    ? "bg-blue-500 hover:bg-blue-600 text-white"
                    : "border border-white/10 hover:border-white/20 text-white hover:bg-white/5"
                }`}
              >
                Comenzar prueba gratis
              </a>

              {/* Features */}
              <ul className="space-y-3">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      className="mt-0.5 flex-shrink-0"
                      style={{ color: plan.color }}
                    >
                      <path
                        d="M4 8l2.667 2.667L12 5.333"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="text-[#E2E8F0]">{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-[#94A3B8] mt-8">
          Los precios en UF se actualizan automáticamente con el valor oficial
          del día publicado por el Banco Central de Chile.
        </p>
      </div>
    </section>
  );
}
