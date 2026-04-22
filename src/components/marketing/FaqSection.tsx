"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "¿Qué es OPAI y para qué tipo de empresa es?",
    a: "OPAI es un ERP vertical diseñado exclusivamente para empresas de seguridad privada en Chile. Cubre gestión de guardias, pautas de turno, marcaciones GPS, rondas, payroll, facturación y portales para clientes, guardias y supervisores. Sirve tanto para empresas con 20 guardias como para operaciones con miles.",
  },
  {
    q: "¿Cómo funciona el control de rondas con GPS y QR?",
    a: "El guardia escanea checkpoints QR con su celular. OPAI registra automáticamente la ubicación GPS, la hora y una foto de evidencia. El supervisor y el cliente ven el progreso de la ronda en tiempo real. La IA detecta patrones anómalos y genera alertas.",
  },
  {
    q: "¿OPAI reemplaza mi sistema actual (ERP, software de RRHH, planilla de payroll)?",
    a: "Sí. OPAI fue diseñado para reemplazar la combinación de sistemas aislados que usan la mayoría de las empresas de seguridad. En un solo sistema tienes: operación (pautas, marcaciones, rondas), personal (fichas, documentos, payroll) y finanzas (facturación, contabilidad). Todo conectado.",
  },
  {
    q: "¿Cuánto cuesta OPAI en pesos chilenos?",
    a: "Los precios se expresan en UF por guardia activo/mes. Starter parte en 0.12 UF (~$4.500 CLP), Operaciones Pro en 0.28 UF (~$10.600 CLP) y Suite Completa en 0.46 UF (~$17.500 CLP). Los valores en CLP se actualizan automáticamente según la UF del día.",
  },
  {
    q: "¿Qué incluye el Portal del Cliente y cómo accede mi cliente?",
    a: "El Portal del Cliente es una interfaz web donde tu cliente ve en tiempo real: qué guardias están activos, marcaciones con foto y GPS, rondas completadas, incidentes reportados y documentos. Accede con un link y PIN — no necesita instalar nada.",
  },
  {
    q: "¿OPAI cumple con la normativa laboral chilena (LRE, Dirección del Trabajo)?",
    a: "Sí. El módulo de Payroll genera liquidaciones según la LRE vigente, calcula imposiciones, gratificaciones y horas extra según el Código del Trabajo. El módulo de Fiscalización DT permite que un inspector acceda a datos verificables con hash auditables.",
  },
  {
    q: "¿En cuánto tiempo puedo tener OPAI funcionando en mi empresa?",
    a: "La implementación base (Starter) toma entre 3 y 5 días. Suite Completa con migración de datos, payroll y facturación toma entre 2 y 4 semanas. Incluye onboarding personalizado y soporte durante la transición.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Preguntas frecuentes
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className="rounded-xl border border-white/[0.07] bg-[#141E30]/30 overflow-hidden"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-semibold text-white pr-4">
                    {faq.q}
                  </span>
                  <svg
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`flex-shrink-0 text-[#94A3B8] transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  >
                    <path d="M6 8l4 4 4-4" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5">
                    <p className="text-sm text-[#94A3B8] leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
