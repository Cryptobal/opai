const TESTIMONIALS = [
  {
    quote:
      "Antes teníamos 3 sistemas distintos y el gerente de operaciones vivía exportando Excel. Con OPAI todo está conectado — el cliente ve las rondas en tiempo real y dejó de llamarnos.",
    name: "Rodrigo Fuentes",
    role: "Director de Operaciones",
    company: "Empresa de Seguridad, Santiago",
  },
  {
    quote:
      "La alerta de cobertura por WhatsApp nos cambió la vida. Cuando un guardia no marca, el sistema ya tiene 3 reemplazos contactados antes de que yo me entere.",
    name: "Carolina Valdés",
    role: "Gerente de Operaciones",
    company: "Empresa de Seguridad, Valparaíso",
  },
  {
    quote:
      "Nuestros clientes ahora ven en su portal todo lo que pasa en sus instalaciones. Eso nos diferencia de la competencia y ha reducido la rotación de contratos en un 40%.",
    name: "Andrés Sepúlveda",
    role: "Gerente Comercial",
    company: "Empresa de Seguridad, Concepción",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Lo que dicen nuestros clientes
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl border border-white/[0.07] bg-[#141E30]/30 p-6 sm:p-8"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="#F59E0B"
                  >
                    <path d="M8 1.333l1.867 3.78 4.133.6-2.933 2.86.72 4.094L8 10.653l-3.787 1.987.72-4.094L1.933 5.72l4.134-.6L8 1.333z" />
                  </svg>
                ))}
              </div>

              <blockquote className="text-sm text-[#E2E8F0] leading-relaxed mb-6">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <div>
                <div className="text-sm font-semibold text-white">{t.name}</div>
                <div className="text-xs text-[#94A3B8]">{t.role}</div>
                <div className="text-xs text-[#94A3B8]">{t.company}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
